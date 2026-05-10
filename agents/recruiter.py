"""
agents/recruiter.py — Agent A: The Recruiter
---------------------------------------------
Plays a strict technical interviewer from a top-tier company.
Responsibilities:
  - Ask the opening question based on topic + difficulty
  - Receive candidate answers and drill into specifics
  - Maintain conversation history across turns
"""

import logging
from config import MODEL, LOCAL_MODEL_NAME, RECRUITER_MAX_TOKENS, RECRUITER_TEMPERATURE
from cache import make_key, get_fs, set_fs

logger = logging.getLogger(__name__)

# System prompt template — injected with topic and difficulty at runtime
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

Topic: {topic}
Difficulty Level: {difficulty}
"""


def build_system_prompt(topic: str, difficulty: str) -> str:
    """Fill the system prompt template with the chosen topic and difficulty."""
    return SYSTEM_PROMPT.format(topic=topic, difficulty=difficulty)


def ask_opening_question(client, topic: str, difficulty: str, model_name: str = None) -> str:
    """
    Called once at the start of an interview session.
    Returns the recruiter's first question as a plain string.

    Cache: filesystem-backed (survives Render restarts / cold starts).
    Opening questions for a given (topic, difficulty) pair are reusable —
    they don't depend on any prior conversation state.
    A small pool of 3 cached variants is maintained per (topic, difficulty)
    so the experience doesn't feel identical every time.
    """
    import random

    # Pick one of 3 cache slots at random — gives variety while still caching
    slot = random.randint(0, 2)
    cache_key = make_key("opening_question", topic, difficulty, slot)
    cached = get_fs(cache_key)
    if cached is not None:
        logger.debug("ask_opening_question fs cache hit: slot=%d %s", slot, cache_key[:8])
        return cached

    system = build_system_prompt(topic, difficulty)

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            #{"role": "user",   "content": "Start the interview now."},
            {
                "role": "user",
                "content": (
                    "Start the interview now. Greet the candidate briefly and warmly -- "
                    "one or two sentences max -- then ask your first question on the topic. "
                    "Sound like a real person, not a script."
                    ),
    },
        ],
        max_tokens=RECRUITER_MAX_TOKENS,
        temperature=RECRUITER_TEMPERATURE,
    )

    opening = response.choices[0].message.content
    set_fs(cache_key, opening)
    return opening


CONTEXT_WINDOW = 6  # last 3 exchanges (3 assistant + 3 user messages)


def ask_followup(client, topic: str, difficulty: str, history: list, candidate_answer: str, model_name: str = None, adaptive_instructions: str = None) -> str:
    """
    Called after every candidate answer.
    Uses a sliding window of the last 3 exchanges to limit token usage.
    When adaptive_instructions are provided, they guide what the recruiter asks next.
    """
    system = build_system_prompt(topic, difficulty)

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

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=messages,
        max_tokens=RECRUITER_MAX_TOKENS,
        temperature=RECRUITER_TEMPERATURE,
    )

    return response.choices[0].message.content

def close_session(client, topic: str, difficulty: str, history: list, model_name: str = None) -> str:
    """
    Generate a warm, human closing remark after the last round.
    Call this just before showing the end-of-session evaluator.
    """
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
