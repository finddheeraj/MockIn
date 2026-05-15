"""
agents/recruiter.py — Agent A: The Recruiter
---------------------------------------------
Plays a strict technical interviewer from a top-tier company.
Responsibilities:
  - Ask the opening question based on topic + difficulty
  - Receive candidate answers and drill into specifics
  - Maintain conversation history across turns

Conversational modes added:
  - Thread pull       : quotes a fragment from the candidate's last answer
  - Mid-answer reaction: short verbal acknowledgment before the follow-up question
  - Interrupt         : called mid-typing with partial answer text
  - Clarification     : asks the candidate to expand before scoring
"""

import logging
import random
from config import MODEL, LOCAL_MODEL_NAME, RECRUITER_MAX_TOKENS, RECRUITER_TEMPERATURE
from cache import make_key, get_fs, set_fs

logger = logging.getLogger(__name__)

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an experienced technical interviewer at a well-respected company.
You are warm, curious, and professional -- you genuinely enjoy learning how candidates think.

Core persona:
- Conversational and human, not robotic or interrogative
- You acknowledge what the candidate said before moving forward
- You probe with genuine curiosity, not pressure
- You vary your pacing: sometimes you dig deeper, sometimes you pivot to a fresh angle

Conversation rules:
1. Ask ONE question per turn -- never stack questions.
2. Always open your reply with a brief natural acknowledgment (1 sentence) referencing their answer.
   Vary your openers -- never repeat the same phrase. Examples:
     "That's a solid foundation -- especially the point about X."
     "Good instinct. I want to push on one thing though..."
     "I see where you're going. Let me dig into that a bit..."
     "Interesting approach. Most people don't mention X -- why did you?"
     "That makes sense at a high level. Let's get more concrete."
3. Follow-ups should feel like natural curiosity, not a checklist. Reference what they just said.
4. Occasionally signal topic transitions like a human would (every 2-3 rounds):
     "You've handled that well -- let me shift gears and ask you about..."
     "Let's move on. I want to see how you think about..."
5. Keep each reply to 3-5 sentences max.
6. When wrapping up the session (if instructed), close warmly:
     "That was a good conversation -- I appreciated how you walked through your reasoning."
7. Do NOT reveal you are an AI. Stay fully in character as a human interviewer.
8. NEVER use placeholders like [name], [company], [topic] — speak directly and naturally as if the candidate is right in front of you. You have no name and need no company name; just be present.

Topic: {topic}
Difficulty Level: {difficulty}
"""


def build_system_prompt(topic: str, difficulty: str) -> str:
    return SYSTEM_PROMPT.format(topic=topic, difficulty=difficulty)


# ── Utility ───────────────────────────────────────────────────────────────────

def extract_quote(answer: str, max_words: int = 12) -> str:
    """Pull the last N words from the candidate's answer for thread-pull prompts."""
    words = answer.strip().split()
    if len(words) <= max_words:
        return answer.strip()
    return " ".join(words[-max_words:])


# ── Opening question ──────────────────────────────────────────────────────────

def ask_opening_question(client, topic: str, difficulty: str, model_name: str = None) -> str:
    slot = random.randint(0, 2)
    cache_key = make_key("opening_question", topic, difficulty, slot)
    cached = get_fs(cache_key)
    if cached is not None:
        logger.debug("ask_opening_question fs cache hit: slot=%d %s", slot, cache_key[:8])
        return cached

    system = build_system_prompt(topic, difficulty)

    # The key fix: give the model a concrete first-person example of what to say,
    # so it performs the greeting rather than describing or templating it.
    user_prompt = (
        "You are now live in the interview room. The candidate has just joined. "
        "Say hello naturally and ask your first technical question on the topic. "
        "Speak directly as yourself — do NOT use placeholders like [name] or [company]. "
        "Do NOT write 'Greeting:' or label your output in any way. "
        "Just speak. Example of correct style: "
        "'Hey, good to meet you — thanks for making time. "
        "Let's jump in. Can you walk me through how you'd approach designing a rate limiter at scale?' "
        "Now do the same for the topic you've been given. Keep it to 2-3 sentences."
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user_prompt},
        ],
        max_tokens=RECRUITER_MAX_TOKENS,
        temperature=RECRUITER_TEMPERATURE,
    )

    opening = response.choices[0].message.content.strip()

    # Strip any residual label prefixes the model might still emit (e.g. "Greeting: ...")
    for prefix in ("Greeting:", "Interviewer:", "Note:", "Response:"):
        if opening.lower().startswith(prefix.lower()):
            opening = opening[len(prefix):].lstrip(' "')

    set_fs(cache_key, opening)
    return opening


# ── Follow-up (main conversational turn) ─────────────────────────────────────

CONTEXT_WINDOW = 6


def ask_followup(
    client,
    topic: str,
    difficulty: str,
    history: list,
    candidate_answer: str,
    model_name: str = None,
    adaptive_instructions: str = None,
    round_num: int = 0,
) -> dict:
    """
    Called after every candidate answer.

    Returns a dict:
      - "reaction"  : short 1-sentence verbal acknowledgment (shown first in UI)
      - "followup"  : the actual next question
    """
    system = build_system_prompt(topic, difficulty)

    # Thread-pull: every even round, reference a specific phrase the candidate said
    if round_num > 0 and round_num % 2 == 0:
        quote = extract_quote(candidate_answer, max_words=10)
        system += (
            f'\n\nTHREAD DIRECTIVE: The candidate just said "...{quote}". '
            "In your follow-up, explicitly reference this phrase and probe it. "
            f'Example: "You mentioned \'{quote}\' -- can you walk me through what you meant specifically?"'
        )

    if adaptive_instructions:
        system += f"\n\nSTRATEGY DIRECTIVE (follow this for your next question):\n{adaptive_instructions}"

    recent_history = [
        {"role": m["role"], "content": m["content"]}
        for m in history[-CONTEXT_WINDOW:]
    ]

    messages = (
        [{"role": "system", "content": system}]
        + recent_history
        + [{"role": "user", "content": candidate_answer}]
    )

    # Step 1: short reaction
    reaction_system = (
        "You are a human technical interviewer. The candidate just finished speaking. "
        "Give ONE short natural verbal reaction -- 1 sentence only, no question yet. "
        "Vary your phrasing. Examples: 'Hmm, interesting angle.' / 'That's a solid start.' / "
        "'I want to dig into that.' / 'Okay, I see where you're going.' "
        "Do NOT ask a question. Do NOT say 'great answer'."
    )
    reaction_resp = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": reaction_system},
            {"role": "user", "content": f"Candidate just said: {candidate_answer[:300]}"},
        ],
        max_tokens=60,
        temperature=0.85,
    )
    reaction = reaction_resp.choices[0].message.content.strip()

    # Step 2: follow-up question
    followup_resp = client.chat.completions.create(
        model=model_name or MODEL,
        messages=messages,
        max_tokens=RECRUITER_MAX_TOKENS,
        temperature=RECRUITER_TEMPERATURE,
    )
    followup = followup_resp.choices[0].message.content.strip()

    return {"reaction": reaction, "followup": followup}


# ── Interrupt (mid-answer) ────────────────────────────────────────────────────

def generate_interrupt(client, topic: str, partial_answer: str, model_name: str = None) -> str:
    """
    Called with the candidate's partial (incomplete) answer.
    Returns a short interrupt. Caller decides whether to fire it (~30% of the time).
    """
    system = (
        f"You are a human technical interviewer on the topic: {topic}. "
        "The candidate is mid-answer. You noticed something specific they just said. "
        "Jump in with a short clarifying question -- 1-2 sentences. "
        "Start with a natural interrupt marker: 'Sorry to jump in--', 'Hold on--', "
        "'Quick question--', or 'Wait--'. Pick ONE thing they said. Don't summarise everything."
    )

    snippet = partial_answer.strip()[-200:]

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": f"Candidate is mid-sentence: ...{snippet}"},
        ],
        max_tokens=80,
        temperature=0.75,
    )
    return response.choices[0].message.content.strip()


# ── Clarification request (before scoring) ───────────────────────────────────

def ask_clarification(
    client,
    topic: str,
    difficulty: str,
    history: list,
    candidate_answer: str,
    model_name: str = None,
) -> str:
    """
    Called when a candidate's answer is too short or vague.
    Scoring is deferred until the candidate replies to the clarification.
    """
    system = build_system_prompt(topic, difficulty)
    system += (
        "\n\nCLARIFICATION MODE: The candidate gave a brief or vague answer. "
        "Ask ONE short clarifying question that invites them to expand on a specific part. "
        "Do NOT score or move to a new topic. Sound genuinely curious. "
        "Examples: 'When you say X, do you mean...?' / 'Can you be more specific about...?' "
    )

    recent_history = [
        {"role": m["role"], "content": m["content"]}
        for m in history[-4:]
    ]

    messages = (
        [{"role": "system", "content": system}]
        + recent_history
        + [{"role": "user", "content": candidate_answer}]
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=messages,
        max_tokens=120,
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


# ── Session close ─────────────────────────────────────────────────────────────

def close_session(client, topic: str, difficulty: str, history: list, model_name: str = None) -> str:
    system = build_system_prompt(topic, difficulty)

    recent_history = [
        {"role": m["role"], "content": m["content"]}
        for m in history[-4:]
    ]

    messages = (
        [{"role": "system", "content": system}]
        + recent_history
        + [{
            "role": "user",
            "content": (
                "[INTERNAL: The interview session is now complete. "
                "Give a brief, warm, human closing statement -- 2-3 sentences. "
                "Acknowledge something specific about how the candidate approached the session. "
                "Do NOT ask another question.]"
            ),
        }]
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=messages,
        max_tokens=150,
        temperature=0.8,
    )
    return response.choices[0].message.content