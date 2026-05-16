"""
routes/interview.py — Interview API Routes (Agentic)
-----------------------------------------------------
Endpoints:
  POST /start        — Kick off session, initialize agentic state
  POST /answer       — Agentic pipeline: score → adapt → parallel(recruiter, coach)
  POST /interrupt    — Mid-answer interrupt from recruiter (called while candidate is typing)
  POST /clarify      — Request clarification before scoring (deferred scoring)
  POST /nudge        — Gentle prompt when candidate has gone silent
  POST /end          — Trigger evaluator for end-of-session report
  POST /reset        — Clear session

Agentic execution order per /answer:
  1. Scorer scores the candidate's answer (sync)
  2. Adaptive controller decides next action (sync)
  3. Knowledge base lookup for reference data (instant, no LLM)
  4. Recruiter + Coach run in parallel (recruiter gets adaptive instructions,
     coach gets KB reference)
"""
import json
import logging
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Blueprint, request, jsonify, session, make_response
import io, textwrap
from agents.recruiter import (
    ask_opening_question, ask_followup, close_session,
    generate_interrupt, ask_clarification,
)
from agents.coach import get_feedback, generate_answer
from agents.scorer import score_answer, compute_weak_areas
from agents.adaptive_controller import decide_next_action, _fallback_decision
from agents.evaluator import evaluate_session
from tools.knowledge_base import lookup_reference, detect_subtopic, get_prep_questions

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

from llm_client import get_grok_client, get_local_client
from config import LLM_PROVIDER, MODEL, LOCAL_MODEL_NAME, MIN_ROUNDS_FOR_EVAL
from cache import stats as cache_stats

logger = logging.getLogger(__name__)

interview_bp = Blueprint("interview", __name__)


@interview_bp.route("/cache-stats", methods=["GET"])
def get_cache_stats():
    """Debug endpoint: shows current LRU and filesystem cache sizes."""
    return jsonify(cache_stats())


@interview_bp.route("/session-status", methods=["GET"])
def session_status():
    topic   = session.get("topic")
    history = session.get("history", [])
    
    has_answer = any(msg.get("role") == "user" for msg in history)

    if topic and has_answer:
        return jsonify({
            "active":         True,
            "topic":          topic,
            "difficulty":     session.get("difficulty", ""),
            "round":          session.get("round", 0),
            "history":        history,
            "scores":         session.get("scores", []),
            "adaptive_state": session.get("adaptive_state"),
        })

    return jsonify({"active": False})


def _get_primary_client() -> tuple:
    if LLM_PROVIDER in ("local",):
        return (get_local_client(), LOCAL_MODEL_NAME)
    return (get_grok_client(), MODEL)


def _get_active_clients() -> dict:
    clients = {}
    if LLM_PROVIDER in ("grok", "both"):
        clients["grok"]  = (get_grok_client(), MODEL)
    if LLM_PROVIDER in ("local", "both"):
        clients["local"] = (get_local_client(), LOCAL_MODEL_NAME)
    return clients

# ── /questions ────────────────────────────────────────────────────────────────────
@interview_bp.route("/questions", methods=["POST"])
def get_sample_questions():
    data       = request.json
    topic      = data.get("topic", "").strip()
    difficulty = data.get("difficulty", "").strip()
    offset     = int(data.get("offset", 0))

    if not topic or not difficulty:
        return jsonify({"error": "Topic and difficulty are required."}), 400

    questions = get_prep_questions(topic, difficulty, count=10, offset=offset)
    if not questions and offset == 0:
        return jsonify({"error": "No questions found for this topic/difficulty."}), 404

    # Enrich with coach-generated ideal answers (filesystem-cached — no repeat LLM calls)
    try:
        clients = _get_active_clients()
        provider_name, (client, model_name) = next(iter(clients.items()))
        if client:
            for q in questions:
                q["ideal_answer"] = generate_answer(
                    client, topic, difficulty, q["question"],
                    model_name=model_name
                )
    except Exception as e:
        logger.warning("generate_answer failed, falling back to ideal_answer_points: %s", e)
        # ideal_answer already set by get_prep_questions — just keep it

    return jsonify({"questions": questions, "topic": topic, "difficulty": difficulty,
                    "has_more": len(questions) == 10})

# ── /prep-pdf ────────────────────────────────────────────────────────────────────
@interview_bp.route("/prep-pdf", methods=["POST"])
def download_prep_pdf():
    import re
    data       = request.json or {}
    topic      = data.get("topic", "Preparation")
    difficulty = data.get("difficulty", "")
    questions  = data.get("questions", [])

    if not questions:
        return jsonify({"error": "No questions found for this topic/difficulty."}), 404

    def esc(t):
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def md_to_rl(text):
        """Convert a single line of markdown to ReportLab inline XML."""
        # Escape HTML special chars first
        text = esc(text)
        # **bold** → <b>bold</b>
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        # *italic* → <i>italic</i>
        text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
        return text

    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(buffer, pagesize=A4,
                               leftMargin=2*cm, rightMargin=2*cm,
                               topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()

    title_style   = ParagraphStyle("PrepTitle", parent=styles["Heading1"],
                                   fontSize=18, textColor=colors.HexColor("#1a1a2e"),
                                   spaceAfter=12, alignment=TA_CENTER)
    q_style       = ParagraphStyle("PrepQ", parent=styles["Normal"],
                                   fontSize=12, textColor=colors.HexColor("#1a1a2e"),
                                   fontName="Helvetica-Bold", spaceAfter=6,
                                   spaceBefore=16, leftIndent=0)
    section_style = ParagraphStyle("PrepSection", parent=styles["Normal"],
                                   fontSize=10, textColor=colors.HexColor("#1a1a2e"),
                                   fontName="Helvetica-Bold", spaceAfter=3,
                                   spaceBefore=6, leftIndent=20)
    body_style    = ParagraphStyle("PrepBody", parent=styles["Normal"],
                                   fontSize=10, textColor=colors.HexColor("#333333"),
                                   spaceAfter=3, leftIndent=20, leading=15)
    bullet_style  = ParagraphStyle("PrepBullet", parent=styles["Normal"],
                                   fontSize=10, textColor=colors.HexColor("#333333"),
                                   spaceAfter=2, leftIndent=36, bulletIndent=24,
                                   leading=14)

    story = []
    story.append(Paragraph("MockMind — Prep Questions", title_style))
    story.append(Paragraph(f"Topic: {esc(topic)} &nbsp;|&nbsp; Level: {esc(difficulty)}", styles["Heading3"]))
    story.append(Spacer(1, 0.4*cm))

    for i, q in enumerate(questions, start=1):
        # Question heading
        story.append(Paragraph(f"Q{i}: {md_to_rl(q.get('question', ''))}", q_style))

        # Parse and render the answer
        raw = q.get("ideal_answer", q.get("answer", ""))
        for line in raw.split("\n"):
            stripped = line.strip()
            if not stripped:
                story.append(Spacer(1, 3))
                continue

            # * heading line (markdown section header like "* **Key Points:**")
            if re.match(r'^\*\s+\*\*', stripped):
                text = re.sub(r'^\*\s+', '', stripped)
                story.append(Paragraph(md_to_rl(text), section_style))

            # + bullet or - bullet
            elif stripped.startswith(("+ ", "- ", "• ")):
                text = re.sub(r'^[+\-•]\s+', '', stripped)
                story.append(Paragraph(f"• {md_to_rl(text)}", bullet_style))

            # Numbered list  1. 2. etc
            elif re.match(r'^\d+\.\s+', stripped):
                text = re.sub(r'^\d+\.\s+', '', stripped)
                num  = re.match(r'^(\d+)\.', stripped).group(1)
                story.append(Paragraph(f"{num}. {md_to_rl(text)}", bullet_style))

            # Plain paragraph
            else:
                story.append(Paragraph(md_to_rl(stripped), body_style))

        story.append(Spacer(1, 6))

    doc.build(story)
    buffer.seek(0)

    response = make_response(buffer.read())
    response.headers["Content-Type"]        = "application/pdf"
    response.headers["Content-Disposition"] = f"attachment; filename=mockmind_prep_{topic.replace(' ', '_')}.pdf"
    return response


# ── /start ────────────────────────────────────────────────────────────────────

@interview_bp.route("/start", methods=["POST"])
def start_interview():
    data       = request.json
    topic      = data.get("topic", "System Design")
    difficulty = data.get("difficulty", "Mid-Level")

    session["topic"]      = topic
    session["difficulty"] = difficulty
    session["history"]    = []
    session["scores"]     = []
    session["round"]      = 0
    session["adaptive_state"] = {
        "current_subtopic":   None,
        "current_difficulty": difficulty,
        "action_history":     [],
        "weak_areas":         [],
        "strong_areas":       [],
    }
    # Conversational mode state
    session["awaiting_clarification"] = False
    session["pending_answer"]         = ""

    clients = _get_active_clients()

    if len(clients) == 1:
        provider_name, (client, model_name) = next(iter(clients.items()))
        opening_question = ask_opening_question(client, topic, difficulty, model_name)
        session["history"] = [{"role": "assistant", "content": opening_question}]
        return jsonify({
            "recruiter_message": opening_question,
            "coach_feedback":    None,
            "provider":          provider_name,
        })

    # Both providers in parallel
    results = {}
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(ask_opening_question, client, topic, difficulty, model_name): name
            for name, (client, model_name) in clients.items()
        }
        for future in as_completed(futures):
            provider_name = futures[future]
            try:
                results[provider_name] = future.result()
            except Exception as e:
                results[provider_name] = f"[Error from {provider_name}: {e}]"

    primary = results.get("grok") or results.get("local", "")
    session["history"] = [{"role": "assistant", "content": primary}]

    return jsonify({
        "recruiter_message":       results.get("grok", ""),
        "recruiter_message_local": results.get("local", ""),
        "coach_feedback":          None,
        "coach_feedback_local":    None,
        "provider":                "both",
    })


# ── /answer ───────────────────────────────────────────────────────────────────

@interview_bp.route("/answer", methods=["POST"])
def submit_answer():
    """
    Agentic pipeline. If awaiting_clarification is True, the incoming answer is
    merged with the pending_answer before scoring, then the clarification flag is cleared.
    """
    data             = request.json
    candidate_answer = data.get("answer", "").strip()

    if not candidate_answer:
        return jsonify({"error": "Answer cannot be empty"}), 400

    topic          = session.get("topic",      "System Design")
    difficulty     = session.get("difficulty", "Mid-Level")
    history        = session.get("history",    [])
    scores         = session.get("scores",     [])
    adaptive_state = session.get("adaptive_state", {})
    round_num      = session.get("round", 0) + 1
    session["round"] = round_num

    # ── Merge clarification reply with original answer ────────────────────────
    if session.get("awaiting_clarification") and session.get("pending_answer"):
        candidate_answer = (
            session["pending_answer"] + "\n[Clarification] " + candidate_answer
        )
        session["awaiting_clarification"] = False
        session["pending_answer"]         = ""

    # Last recruiter question for scoring context
    last_question = ""
    for msg in reversed(history):
        if msg["role"] == "assistant":
            last_question = msg["content"]
            break

    # ── Step 1: Score ─────────────────────────────────────────────────────────
    primary_client, primary_model = _get_primary_client()
    score_result = score_answer(
        primary_client, topic, difficulty, last_question, candidate_answer, primary_model
    )
    score_result["round"] = round_num
    scores.append(score_result)
    session["scores"] = scores

    weak_areas, strong_areas = compute_weak_areas(scores)
    adaptive_state["weak_areas"]   = weak_areas
    adaptive_state["strong_areas"] = strong_areas

    # ── Step 2: Adaptive controller ───────────────────────────────────────────
    last_score_val = scores[-2]["overall"] if len(scores) >= 2 else None
    score_delta    = abs(score_result["overall"] - last_score_val) if last_score_val is not None else 999

    if round_num % 2 == 0 and score_delta >= 1.5:
        adaptive_decision = decide_next_action(
            primary_client, topic, adaptive_state, score_result, scores, primary_model
        )
    else:
        adaptive_decision = _fallback_decision(
            score_result,
            adaptive_state.get("current_subtopic", "general"),
            adaptive_state.get("current_difficulty", difficulty),
            adaptive_state.get("weak_areas", []),
        )

    adaptive_state["current_subtopic"]   = adaptive_decision.get("target_subtopic",   adaptive_state.get("current_subtopic"))
    adaptive_state["current_difficulty"] = adaptive_decision.get("target_difficulty", adaptive_state.get("current_difficulty"))
    adaptive_state["action_history"].append(f"{adaptive_decision['action']}:{adaptive_state['current_subtopic']}")
    session["adaptive_state"] = adaptive_state

    # ── Step 3: KB lookup ─────────────────────────────────────────────────────
    subtopic       = adaptive_state.get("current_subtopic") or detect_subtopic(last_question, topic)
    reference_data = lookup_reference(topic, subtopic, difficulty)

    # ── Step 4: Recruiter + Coach in parallel ─────────────────────────────────
    adaptive_instructions = adaptive_decision.get("recruiter_instructions", "")
    clients = _get_active_clients()

    if len(clients) == 1:
        provider_name, (client, model_name) = next(iter(clients.items()))

        with ThreadPoolExecutor(max_workers=2) as executor:
            recruiter_future = executor.submit(
                ask_followup,
                client, topic, adaptive_state.get("current_difficulty", difficulty),
                history, candidate_answer, model_name, adaptive_instructions, round_num,
            )
            coach_future = executor.submit(
                get_feedback, client, topic, difficulty, history,
                candidate_answer, model_name, reference_data,
            )
            recruiter_result = recruiter_future.result()
            coach_reply      = coach_future.result()

        # recruiter_result is now {"reaction": ..., "followup": ...}
        reaction = recruiter_result.get("reaction", "")
        followup = recruiter_result.get("followup", "")

        history.append({
            "role": "user",
            "content": candidate_answer,
            "coach_feedback": coach_reply,
            "reference_data": reference_data,
            "score":          score_result,
            "round":          round_num,
        })
        history.append({"role": "assistant", "content": followup})
        session["history"] = history

        return jsonify({
            "recruiter_reaction":  reaction,
            "recruiter_message":   followup,
            "coach_feedback":      coach_reply,
            "score":               score_result,
            "adaptive": {
                "action":               adaptive_decision["action"],
                "reasoning":            adaptive_decision.get("reasoning", ""),
                "current_subtopic":     adaptive_state.get("current_subtopic"),
                "current_difficulty":   adaptive_state.get("current_difficulty"),
            },
            "reference_answer": reference_data,
            "round":            round_num,
            "provider":         provider_name,
        })

    # ── Both providers ────────────────────────────────────────────────────────
    results = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {}
        for name, (client, model_name) in clients.items():
            futures[executor.submit(
                ask_followup,
                client, topic, adaptive_state.get("current_difficulty", difficulty),
                history, candidate_answer, model_name, adaptive_instructions, round_num,
            )] = (name, "recruiter")
            futures[executor.submit(
                get_feedback, client, topic, difficulty, history,
                candidate_answer, model_name, reference_data,
            )] = (name, "coach")

        for future in as_completed(futures):
            provider_name, agent_role = futures[future]
            try:
                results[(provider_name, agent_role)] = future.result()
            except Exception as e:
                results[(provider_name, agent_role)] = f"[Error from {provider_name}: {e}]"

    grok_recruiter  = results.get(("grok", "recruiter"), {})
    local_recruiter = results.get(("local", "recruiter"), {})
    primary_result  = grok_recruiter or local_recruiter or {}
    reaction = primary_result.get("reaction", "") if isinstance(primary_result, dict) else ""
    followup = primary_result.get("followup", "") if isinstance(primary_result, dict) else str(primary_result)

    primary_coach = results.get(("grok", "coach")) or results.get(("local", "coach"), "")
    history.append({
        "role": "user",
        "content": candidate_answer,
        "coach_feedback": primary_coach,
        "reference_data": reference_data,
        "score":          score_result,
        "round":          round_num,
    })
    history.append({"role": "assistant", "content": followup})
    session["history"] = history

    def _followup_str(r):
        return r.get("followup", "") if isinstance(r, dict) else str(r)

    return jsonify({
        "recruiter_reaction":        reaction,
        "recruiter_message":         _followup_str(results.get(("grok", "recruiter"), {})),
        "recruiter_message_local":   _followup_str(results.get(("local", "recruiter"), {})),
        "coach_feedback":            results.get(("grok", "coach"), ""),
        "coach_feedback_local":      results.get(("local", "coach"), ""),
        "score":                     score_result,
        "adaptive": {
            "action":               adaptive_decision["action"],
            "reasoning":            adaptive_decision.get("reasoning", ""),
            "current_subtopic":     adaptive_state.get("current_subtopic"),
            "current_difficulty":   adaptive_state.get("current_difficulty"),
        },
        "reference_answer": reference_data,
        "round":            round_num,
        "provider":         "both",
    })


# ── /interrupt ────────────────────────────────────────────────────────────────

@interview_bp.route("/interrupt", methods=["POST"])
def interrupt_answer():
    """
    Called by the frontend when the candidate has been typing for a while.
    Returns a short mid-answer interrupt message ~30% of the time.
    No history is mutated — the interrupt is displayed inline in the UI only.
    """
    data           = request.json
    partial_answer = data.get("partial_answer", "").strip()
    topic          = session.get("topic", "System Design")

    if not partial_answer or len(partial_answer.split()) < 40:
        return jsonify({"should_interrupt": False})

    # Probabilistic gate — keeps the feature feeling organic, not mechanical
    if random.random() > 0.30:
        return jsonify({"should_interrupt": False})

    primary_client, primary_model = _get_primary_client()
    message = generate_interrupt(primary_client, topic, partial_answer, primary_model)

    return jsonify({"should_interrupt": True, "interrupt_message": message})


# ── /clarify ──────────────────────────────────────────────────────────────────

@interview_bp.route("/clarify", methods=["POST"])
def request_clarification():
    """
    Called instead of /answer when the candidate's response is too short/vague.
    The answer is stored in session; scoring is deferred until the next /answer call.
    """
    data             = request.json
    candidate_answer = data.get("answer", "").strip()

    if not candidate_answer:
        return jsonify({"error": "Answer cannot be empty"}), 400

    topic      = session.get("topic",      "System Design")
    difficulty = session.get("difficulty", "Mid-Level")
    history    = session.get("history",    [])

    primary_client, primary_model = _get_primary_client()
    clarification_q = ask_clarification(
        primary_client, topic, difficulty, history, candidate_answer, primary_model
    )

    # Stash the original answer; scoring happens when candidate replies via /answer
    session["pending_answer"]         = candidate_answer
    session["awaiting_clarification"] = True

    return jsonify({"clarification_question": clarification_q})


# ── /nudge ────────────────────────────────────────────────────────────────────

NUDGES = [
    "Take your time — there's no rush.",
    "Want to think out loud? Just start talking through your approach.",
    "If you're unsure, walk me through how you'd approach it step by step.",
    "It's completely fine to say what you know and what you're less certain about.",
    "No pressure — even a partial answer gives us something to work with.",
]

@interview_bp.route("/nudge", methods=["POST"])
def nudge_candidate():
    """
    Stateless gentle prompt when the candidate has gone quiet (20s+ of inactivity).
    Does not affect scoring, history, or session state.
    """
    return jsonify({"nudge_message": random.choice(NUDGES)})


# ── /skip ─────────────────────────────────────────────────────────────────────

@interview_bp.route("/skip", methods=["POST"])
def skip_question():
    topic      = session.get("topic",      "System Design")
    difficulty = session.get("difficulty", "Mid-Level")
    history    = session.get("history",    [])
    adaptive_state = session.get("adaptive_state", {})

    adaptive_state["action_history"].append("skipped")
    session["adaptive_state"] = adaptive_state

    clients = _get_active_clients()
    skip_instruction = "The candidate skipped the previous question. Ask a completely different question on a new subtopic."

    if len(clients) == 1:
        provider_name, (client, model_name) = next(iter(clients.items()))
        recruiter_result = ask_followup(
            client, topic, difficulty, history,
            "I'd like to skip this question.", model_name, skip_instruction, 0,
        )
        next_q = recruiter_result.get("followup", "") if isinstance(recruiter_result, dict) else str(recruiter_result)
        history.append({"role": "user",      "content": "[Skipped]"})
        history.append({"role": "assistant", "content": next_q})
        session["history"] = history
        return jsonify({"recruiter_message": next_q, "provider": provider_name})

    results = {}
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(
                ask_followup, client, topic, difficulty, history,
                "I'd like to skip this question.", model_name, skip_instruction, 0,
            ): name
            for name, (client, model_name) in clients.items()
        }
        for future in as_completed(futures):
            provider_name = futures[future]
            try:
                r = future.result()
                results[provider_name] = r.get("followup", "") if isinstance(r, dict) else str(r)
            except Exception as e:
                results[provider_name] = f"[Error: {e}]"

    primary = results.get("grok") or results.get("local", "")
    history.append({"role": "user",      "content": "[Skipped]"})
    history.append({"role": "assistant", "content": primary})
    session["history"] = history

    return jsonify({
        "recruiter_message":       results.get("grok", ""),
        "recruiter_message_local": results.get("local", ""),
        "provider": "both",
    })


# ── /coach-answer ─────────────────────────────────────────────────────────────

@interview_bp.route("/coach-answer", methods=["POST"])
def coach_answer():
    history    = session.get("history",    [])
    topic      = session.get("topic",      "System Design")
    difficulty = session.get("difficulty", "Mid-Level")

    last_question = ""
    for msg in reversed(history):
        if msg["role"] == "assistant":
            last_question = msg["content"]
            break

    if not last_question:
        return jsonify({"error": "No question to answer yet."}), 400

    subtopic       = detect_subtopic(last_question, topic)
    reference_data = lookup_reference(topic, subtopic, difficulty)

    primary_client, primary_model = _get_primary_client()
    answer = generate_answer(primary_client, topic, difficulty, last_question, primary_model, reference_data)

    return jsonify({"coach_answer": answer})


# ── /end ──────────────────────────────────────────────────────────────────────

@interview_bp.route("/end", methods=["POST"])
def end_interview():
    scores         = session.get("scores",     [])
    history        = session.get("history",    [])
    topic          = session.get("topic",      "System Design")
    difficulty     = session.get("difficulty", "Mid-Level")
    adaptive_state = session.get("adaptive_state", {})

    if len(scores) < MIN_ROUNDS_FOR_EVAL:
        return jsonify({
            "error": f"Need at least {MIN_ROUNDS_FOR_EVAL} rounds for evaluation. Currently: {len(scores)}."
        }), 400

    primary_client, primary_model = _get_primary_client()

    closing_message = close_session(primary_client, topic, difficulty, history, primary_model)
    evaluation      = evaluate_session(
        primary_client, topic, difficulty, history, scores, adaptive_state, primary_model
    )

    return jsonify({"evaluation": evaluation, "closing_message": closing_message})


# ── /reset ────────────────────────────────────────────────────────────────────

@interview_bp.route("/reset", methods=["POST"])
def reset_session():
    session.clear()
    return jsonify({"status": "ok"})


# ── /download-pdf ─────────────────────────────────────────────────────────────

@interview_bp.route("/download-pdf", methods=["GET"])
def download_pdf():
    history    = session.get("history",    [])
    topic      = session.get("topic",      "Interview")
    difficulty = session.get("difficulty", "")
    scores     = session.get("scores",     [])

    if not history:
        return jsonify({"error": "No interview data to export."}), 400

    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(buffer, pagesize=A4,
                               leftMargin=2*cm, rightMargin=2*cm,
                               topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()

    def esc(t):
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    title_style = ParagraphStyle("Title", parent=styles["Heading1"],
                                 fontSize=20, textColor=colors.HexColor("#1a1a2e"),
                                 spaceAfter=6, alignment=TA_CENTER)
    meta_style  = ParagraphStyle("Meta",  parent=styles["Normal"],
                                 fontSize=10, textColor=colors.HexColor("#666666"),
                                 spaceAfter=4, alignment=TA_CENTER)
    q_style     = ParagraphStyle("Q", parent=styles["Normal"],
                                 fontSize=11, textColor=colors.HexColor("#1a1a2e"),
                                 fontName="Helvetica-Bold", spaceAfter=4,
                                 spaceBefore=16, leftIndent=0)
    you_style   = ParagraphStyle("You", parent=q_style,
                                 textColor=colors.HexColor("#2d6a4f"))
    a_style     = ParagraphStyle("A", parent=styles["Normal"],
                                 fontSize=10, textColor=colors.HexColor("#333333"),
                                 spaceAfter=6, leftIndent=20, leading=15)
    score_style = ParagraphStyle("Score", parent=styles["Normal"],
                                 fontSize=10, textColor=colors.HexColor("#0f2a5e"),
                                 fontName="Helvetica-Bold", spaceAfter=4,
                                 spaceBefore=8, leftIndent=8)
    coach_text_style = ParagraphStyle("CoachText", parent=styles["Normal"],
                                 fontSize=9.5, textColor=colors.HexColor("#1a3a2e"),
                                 spaceAfter=4, leftIndent=8, leading=14)
    ref_text_style   = ParagraphStyle("RefText", parent=styles["Normal"],
                                 fontSize=9.5, textColor=colors.HexColor("#1a1a3e"),
                                 spaceAfter=3, leftIndent=16, leading=14)
    ref_label_style  = ParagraphStyle("RefLabel", parent=styles["Normal"],
                                 fontSize=9, textColor=colors.HexColor("#555555"),
                                 fontName="Helvetica-Bold", spaceAfter=3, leftIndent=8)

    story = []

    story.append(Paragraph("MockMind — Interview Transcript", title_style))
    story.append(Paragraph(f"Topic: {topic} &nbsp;|&nbsp; Level: {difficulty}", meta_style))
    if scores:
        avg = sum(s.get("overall", 0) for s in scores) / len(scores)
        story.append(Paragraph(f"Rounds: {len(scores)} &nbsp;|&nbsp; Avg Score: {avg:.1f}/10", meta_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 0.4*cm))

    q_num = 1
    for msg in history:
        role = msg.get("role")
        text = msg.get("content", "").strip()
        if not text:
            continue

        if role == "assistant":
            story.append(Paragraph(f"Q{q_num}: Interviewer", q_style))
            story.append(Paragraph(esc(text), a_style))
            q_num += 1

        elif role == "user":
            story.append(Paragraph("You:", you_style))
            story.append(Paragraph(esc(text), a_style))

            score = msg.get("score")
            if score:
                overall   = score.get("overall", "—")
                dims      = score.get("dimensions", {})
                dim_parts = " &nbsp;·&nbsp; ".join(
                    f"{k.capitalize()}: {v}" for k, v in dims.items()
                ) if dims else ""
                story.append(HRFlowable(width="100%", thickness=0.5,
                                        color=colors.HexColor("#dddddd"), spaceAfter=4))
                story.append(Paragraph(
                    f"Score: {overall}/10" + (f" &nbsp;—&nbsp; {dim_parts}" if dim_parts else ""),
                    score_style,
                ))
                rationale = score.get("rationale", "")
                if rationale:
                    story.append(Paragraph(esc(rationale),
                        ParagraphStyle("Rationale", parent=styles["Normal"],
                            fontSize=9, textColor=colors.HexColor("#666666"),
                            fontStyle="italic", leftIndent=8, spaceAfter=4, leading=13)))

            ref = msg.get("reference_data")
            if ref:
                story.append(HRFlowable(width="100%", thickness=0.5,
                                        color=colors.HexColor("#c5cae9"), spaceAfter=4))
                story.append(Paragraph("Reference Answer",
                    ParagraphStyle("RefHead", parent=styles["Normal"],
                        fontSize=9, fontName="Helvetica-Bold",
                        textColor=colors.HexColor("#0f2a5e"), leftIndent=8, spaceAfter=4)))
                for concept in ref.get("key_concepts", []):
                    story.append(Paragraph(f"• {esc(str(concept))}", ref_text_style))
                for pt in ref.get("ideal_answer_points", []):
                    story.append(Paragraph(f"• {esc(str(pt))}", ref_text_style))

            coach = msg.get("coach_feedback", "")
            if coach:
                story.append(HRFlowable(width="100%", thickness=0.5,
                                        color=colors.HexColor("#b2dfdb"), spaceAfter=4))
                story.append(Paragraph("Coach Feedback",
                    ParagraphStyle("CoachHead", parent=styles["Normal"],
                        fontSize=9, fontName="Helvetica-Bold",
                        textColor=colors.HexColor("#0a5040"), leftIndent=8, spaceAfter=4)))
                story.append(Paragraph(esc(coach), coach_text_style))

            story.append(Spacer(1, 0.3*cm))

    doc.build(story)
    buffer.seek(0)

    response = make_response(buffer.read())
    response.headers["Content-Type"]        = "application/pdf"
    response.headers["Content-Disposition"] = f"attachment; filename=mockmind_{topic.replace(' ', '_')}.pdf"
    return response
