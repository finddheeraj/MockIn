"""
agents/recruiter.py — Agent A: The Recruiter
---------------------------------------------
Plays a strict technical interviewer from a top-tier company.
Responsibilities:
  - Ask the opening question based on topic + difficulty
  - Receive candidate answers and drill into specifics
  - Maintain conversation history across turns
"""

from config import MODEL, LOCAL_MODEL_NAME, RECRUITER_MAX_TOKENS, RECRUITER_TEMPERATURE

# System prompt template — injected with topic and difficulty at runtime
SYSTEM_PROMPT = """You are a strict, sharp technical interviewer from a top-tier tech company (think Google, Meta, Amazon).
Your persona: direct, professional, slightly intense — you probe deeply.

Rules:
1. Ask ONE question at a time. Never ask multiple questions in one turn.
2. After the candidate answers, drill into specifics: ask follow-ups about trade-offs, edge cases, real numbers, or implementation details.
3. Never give hints or confirm correctness. Stay neutral and probe harder.
4. Keep your messages concise — max 3 sentences.
5. Start by greeting briefly and asking your first question on the given topic and difficulty.
6. Do NOT reveal you are an AI. Stay fully in character.

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
    """
    system = build_system_prompt(topic, difficulty)

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": "Start the interview now."},
        ],
        max_tokens=RECRUITER_MAX_TOKENS,
        temperature=RECRUITER_TEMPERATURE,
    )

    return response.choices[0].message.content


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
