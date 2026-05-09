"""
agents/adaptive_controller.py — Adaptive Interview Controller
--------------------------------------------------------------
Analyzes scoring history and autonomously decides the recruiter's next move:
  - Drill deeper on same subtopic
  - Switch to a weak area
  - Increase or decrease difficulty
  - Explore a new subtopic

This is the "brain" that makes the interview genuinely agentic.
"""

import json
from config import (
    MODEL, ADAPTIVE_MAX_TOKENS, ADAPTIVE_TEMPERATURE,
    ADAPTIVE_DRILL_THRESHOLD, ADAPTIVE_SWITCH_THRESHOLD,
    ADAPTIVE_INCREASE_THRESHOLD, ADAPTIVE_DECREASE_THRESHOLD,
)

ACTIONS = [
    "drill_deeper",
    "switch_to_weak_area",
    "increase_difficulty",
    "decrease_difficulty",
    "new_subtopic",
]

SYSTEM_PROMPT = """You are an interview strategy controller. You decide what the interviewer should do next based on the candidate's performance.

Available actions:
- drill_deeper: Ask a more specific follow-up on the same subtopic (candidate showed partial knowledge)
- switch_to_weak_area: Move to a topic the candidate struggles with (to probe further)
- increase_difficulty: The candidate is doing well — make it harder
- decrease_difficulty: The candidate is struggling — give them a fair chance on something easier
- new_subtopic: Move to a fresh subtopic within the same domain (enough data on current one)

Current interview context:
- Main topic: {topic}
- Current difficulty: {current_difficulty}
- Current subtopic: {current_subtopic}
- Weak areas identified: {weak_areas}
- Strong areas identified: {strong_areas}
- Rounds completed: {rounds_completed}

Latest answer score: {latest_score}/10
Score history: {score_history}

RESPOND ONLY WITH VALID JSON:
{{
  "action": "one_of_the_actions_above",
  "target_subtopic": "the subtopic to focus on next",
  "target_difficulty": "Junior|Mid-Level|Senior|Staff / Principal",
  "recruiter_instructions": "Natural language instruction for the recruiter about what to ask next",
  "reasoning": "Brief explanation of why this decision was made"
}}
"""


def decide_next_action(
    client,
    topic: str,
    adaptive_state: dict,
    latest_score: dict,
    scores_history: list,
    model_name: str = None,
) -> dict:
    """
    Decide what the recruiter should do next based on performance data.
    Returns structured decision dict.
    """
    current_difficulty = adaptive_state.get("current_difficulty", "Mid-Level")
    current_subtopic = adaptive_state.get("current_subtopic", "general")
    weak_areas = adaptive_state.get("weak_areas", [])
    strong_areas = adaptive_state.get("strong_areas", [])

    score_values = [s.get("overall", 5.0) for s in scores_history]
    score_history_str = ", ".join(f"{s:.1f}" for s in score_values[-5:])

    system = SYSTEM_PROMPT.format(
        topic=topic,
        current_difficulty=current_difficulty,
        current_subtopic=current_subtopic,
        weak_areas=", ".join(weak_areas) if weak_areas else "none yet",
        strong_areas=", ".join(strong_areas) if strong_areas else "none yet",
        rounds_completed=len(scores_history),
        latest_score=latest_score.get("overall", 5.0),
        score_history=score_history_str or "first round",
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": "Decide the next interview action."},
        ],
        max_tokens=ADAPTIVE_MAX_TOKENS,
        temperature=ADAPTIVE_TEMPERATURE,
    )

    raw = response.choices[0].message.content.strip()

    try:
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)

        action = result.get("action", "drill_deeper")
        if action not in ACTIONS:
            action = "drill_deeper"

        return {
            "action": action,
            "target_subtopic": result.get("target_subtopic", current_subtopic),
            "target_difficulty": result.get("target_difficulty", current_difficulty),
            "recruiter_instructions": result.get("recruiter_instructions", "Continue probing the candidate's knowledge."),
            "reasoning": result.get("reasoning", ""),
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        return _fallback_decision(latest_score, current_subtopic, current_difficulty, weak_areas)


def _fallback_decision(latest_score: dict, current_subtopic: str, current_difficulty: str, weak_areas: list) -> dict:
    """Rule-based fallback when LLM parsing fails."""
    score = latest_score.get("overall", 5.0)

    if score >= ADAPTIVE_INCREASE_THRESHOLD:
        return {
            "action": "increase_difficulty",
            "target_subtopic": current_subtopic,
            "target_difficulty": _next_difficulty(current_difficulty),
            "recruiter_instructions": "The candidate is doing well. Increase complexity and ask about edge cases or scale.",
            "reasoning": f"Score {score:.1f} exceeds threshold for difficulty increase.",
        }
    elif score <= ADAPTIVE_DECREASE_THRESHOLD:
        return {
            "action": "decrease_difficulty",
            "target_subtopic": current_subtopic,
            "target_difficulty": _prev_difficulty(current_difficulty),
            "recruiter_instructions": "The candidate is struggling. Simplify and ask a more foundational question.",
            "reasoning": f"Score {score:.1f} below threshold — reducing difficulty.",
        }
    elif score < ADAPTIVE_DRILL_THRESHOLD and weak_areas:
        return {
            "action": "switch_to_weak_area",
            "target_subtopic": weak_areas[0],
            "target_difficulty": current_difficulty,
            "recruiter_instructions": f"Switch to asking about {weak_areas[0].replace('_', ' ')} — the candidate needs more probing here.",
            "reasoning": "Low score and identified weak area to explore.",
        }
    else:
        return {
            "action": "drill_deeper",
            "target_subtopic": current_subtopic,
            "target_difficulty": current_difficulty,
            "recruiter_instructions": "Ask a deeper follow-up on the same topic. Probe for specifics, trade-offs, or real-world experience.",
            "reasoning": "Moderate score — probing deeper for more signal.",
        }


_DIFFICULTY_ORDER = ["Junior", "Mid-Level", "Senior", "Staff / Principal"]


def _next_difficulty(current: str) -> str:
    idx = _DIFFICULTY_ORDER.index(current) if current in _DIFFICULTY_ORDER else 1
    return _DIFFICULTY_ORDER[min(idx + 1, len(_DIFFICULTY_ORDER) - 1)]


def _prev_difficulty(current: str) -> str:
    idx = _DIFFICULTY_ORDER.index(current) if current in _DIFFICULTY_ORDER else 1
    return _DIFFICULTY_ORDER[max(idx - 1, 0)]
