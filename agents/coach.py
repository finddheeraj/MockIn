"""
agents/coach.py — Agent B: The Coach
--------------------------------------
An invisible observer that watches the interview and gives the
candidate private real-time feedback after every answer.

Key design choices:
  - The coach NEVER speaks to the recruiter
  - It receives the full conversation transcript as context
  - It outputs short, bullet-pointed coaching notes only for the candidate
"""

from config import MODEL, LOCAL_MODEL_NAME, COACH_MAX_TOKENS, COACH_TEMPERATURE

# System prompt — sets the coach's persona and output format
SYSTEM_PROMPT = """You are a silent, invisible interview coach observing a live mock interview.
Your ONLY job: give the candidate brief, punchy real-time coaching after each of their responses.

Rules:
1. Be brutally honest but constructive. Max 3 bullet points.
2. Flag: rambling, vagueness, missing keywords, missed opportunities, strong points.
3. Use short, direct language. Like a coach whispering in their ear.
4. Format: always use bullet points starting with an emoji (✅ for good, ⚠️ for warning, 💡 for tip).
5. Never address the recruiter. Only coach the candidate.
6. If the answer is strong, say so briefly + suggest what to add.

Topic: {topic}
Difficulty Level: {difficulty}
"""


def build_system_prompt(topic: str, difficulty: str) -> str:
    return SYSTEM_PROMPT.format(topic=topic, difficulty=difficulty)


def build_transcript(history: list, latest_answer: str) -> str:
    """
    Builds a minimal transcript with only the latest question + candidate answer.
    This drastically reduces token usage while keeping feedback relevant,
    since the KB reference data provides the grounding context.
    """
    last_question = ""
    for msg in reversed(history):
        if msg["role"] == "assistant":
            last_question = msg["content"]
            break

    lines = []
    if last_question:
        lines.append(f"INTERVIEWER: {last_question}")
    lines.append(f"CANDIDATE: {latest_answer}")
    return "\n\n".join(lines)


def get_feedback(client, topic: str, difficulty: str, history: list, candidate_answer: str, model_name: str = None, reference_data: dict = None) -> str:
    """
    Called after every candidate answer — in parallel with the recruiter's follow-up.
    Returns coaching feedback as a plain string (bullet points with emojis).

    When reference_data is provided (from knowledge base tool), the coach
    compares the candidate's answer against ideal points and flags gaps.
    """
    system     = build_system_prompt(topic, difficulty)
    transcript = build_transcript(history, candidate_answer)

    reference_section = ""
    if reference_data:
        key_concepts = reference_data.get("key_concepts", [])
        ideal_points = reference_data.get("ideal_answer_points", [])
        common_mistakes = reference_data.get("common_mistakes", [])
        difficulty_expectation = reference_data.get("difficulty_expectation", "")

        reference_section = "\n\n--- REFERENCE DATA (use to ground your feedback) ---\n"
        if key_concepts:
            reference_section += f"Key concepts they should mention: {', '.join(key_concepts)}\n"
        if ideal_points:
            reference_section += f"Ideal answer includes: {'; '.join(ideal_points)}\n"
        if common_mistakes:
            reference_section += f"Common mistakes to flag: {'; '.join(common_mistakes)}\n"
        if difficulty_expectation:
            reference_section += f"At {difficulty} level, expected: {difficulty_expectation}\n"
        reference_section += "---\nCompare the candidate's answer against these points. Flag specific missing concepts."

    user_content = (
        f"Here is the interview so far:\n\n{transcript}\n\n"
        "Give coaching feedback on the candidate's latest answer."
        f"{reference_section}"
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        max_tokens=COACH_MAX_TOKENS,
        temperature=COACH_TEMPERATURE,
    )

    return response.choices[0].message.content


ANSWER_SYSTEM_PROMPT = """You are an expert interview coach. Given an interview question, generate the ideal answer a candidate should give.

Rules:
1. Be comprehensive but concise — cover all key points.
2. Use structured format: start with a brief summary, then bullet points for key points.
3. Include specific examples, tools, or patterns where relevant.
4. Match the expected depth for the difficulty level.
5. Make it actionable — something the candidate can learn from.

Topic: {topic}
Difficulty Level: {difficulty}
"""


def generate_answer(client, topic: str, difficulty: str, question: str, model_name: str = None, reference_data: dict = None) -> str:
    """
    Generate an ideal answer for the given interview question.
    Used when the candidate clicks "Get Coach Answer" because they don't know the answer.
    """
    system = ANSWER_SYSTEM_PROMPT.format(topic=topic, difficulty=difficulty)

    reference_section = ""
    if reference_data:
        key_concepts = reference_data.get("key_concepts", [])
        ideal_points = reference_data.get("ideal_answer_points", [])
        if key_concepts:
            reference_section += f"\n\nKey concepts to cover: {', '.join(key_concepts)}"
        if ideal_points:
            reference_section += f"\nIdeal answer includes: {'; '.join(ideal_points)}"

    user_content = (
        f"Interview question: {question}\n\n"
        f"Generate the ideal answer for this question at {difficulty} level."
        f"{reference_section}"
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        max_tokens=1000,
        temperature=0.5,
    )

    return response.choices[0].message.content
