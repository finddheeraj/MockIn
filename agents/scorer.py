"""
agents/scorer.py — Scoring Agent
----------------------------------
Evaluates each candidate answer against a rubric.
Returns structured numeric scores + dimension breakdown.
Uses low temperature for consistency.
"""

import json
import logging
from config import MODEL, SCORER_MAX_TOKENS, SCORER_TEMPERATURE, SCORING_DIMENSIONS
from cache import make_key, get_lru, set_lru

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a technical interview scoring engine. Your job is to evaluate a candidate's answer objectively.

Score the answer on these dimensions (each 0-10):
- clarity: Clear communication, well-organized response
- depth: Technical depth, covers edge cases and trade-offs
- accuracy: Factually correct, no misconceptions
- examples: Uses concrete examples, real tools, specific numbers
- structure: Logical flow, structured approach (e.g., starts with high-level, then details)

Also provide:
- overall: weighted average (0.0-10.0)
- subtopic: the specific concept being tested (e.g., "load_balancing", "hash_tables")
- brief_rationale: ONE sentence explaining the score

Topic: {topic}
Difficulty Level: {difficulty}

RESPOND ONLY WITH VALID JSON in this exact format:
{{
  "overall": 7.2,
  "dimensions": {{
    "clarity": 8,
    "depth": 6,
    "accuracy": 7,
    "examples": 7,
    "structure": 8
  }},
  "subtopic": "load_balancing",
  "brief_rationale": "Good structure but lacked depth on failover mechanisms."
}}
"""


def score_answer(client, topic: str, difficulty: str, question: str, candidate_answer: str, model_name: str = None) -> dict:
    """
    Score a single candidate answer. Returns structured score dict.
    Falls back to default scores if JSON parsing fails.

    Cache: in-process LRU keyed by (topic, difficulty, question, answer).
    Identical answers to identical questions always get the same score,
    so this is safe to cache and avoids a synchronous LLM call on every round.
    """
    cache_key = make_key("score", topic, difficulty, question, candidate_answer)
    cached = get_lru(cache_key)
    if cached is not None:
        logger.debug("score_answer cache hit: %s", cache_key[:8])
        return cached

    system = SYSTEM_PROMPT.format(topic=topic, difficulty=difficulty)

    user_content = (
        f"INTERVIEWER QUESTION:\n{question}\n\n"
        f"CANDIDATE ANSWER:\n{candidate_answer}\n\n"
        "Score this answer. Respond with JSON only."
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        max_tokens=SCORER_MAX_TOKENS,
        temperature=SCORER_TEMPERATURE,
    )

    raw = response.choices[0].message.content.strip()

    try:
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)

        parsed = {
            "overall": float(result.get("overall", 5.0)),
            "dimensions": {
                "clarity": int(result.get("dimensions", {}).get("clarity", 5)),
                "depth": int(result.get("dimensions", {}).get("depth", 5)),
                "accuracy": int(result.get("dimensions", {}).get("accuracy", 5)),
                "examples": int(result.get("dimensions", {}).get("examples", 5)),
                "structure": int(result.get("dimensions", {}).get("structure", 5)),
            },
            "subtopic": result.get("subtopic", "general"),
            "brief_rationale": result.get("brief_rationale", ""),
        }
        set_lru(cache_key, parsed)
        return parsed
    except (json.JSONDecodeError, ValueError, TypeError):
        return _default_score()


def _default_score() -> dict:
    return {
        "overall": 5.0,
        "dimensions": {
            "clarity": 5,
            "depth": 5,
            "accuracy": 5,
            "examples": 5,
            "structure": 5,
        },
        "subtopic": "general",
        "brief_rationale": "Unable to parse score — defaulting to neutral.",
    }


def compute_weak_areas(scores: list) -> tuple:
    """
    Analyze cumulative scores to identify weak and strong areas.
    Returns (weak_areas: list[str], strong_areas: list[str]).
    """
    if not scores:
        return ([], [])

    subtopic_scores = {}
    for s in scores:
        sub = s.get("subtopic", "general")
        if sub not in subtopic_scores:
            subtopic_scores[sub] = []
        subtopic_scores[sub].append(s.get("overall", 5.0))

    weak_areas = []
    strong_areas = []

    for sub, score_list in subtopic_scores.items():
        avg = sum(score_list) / len(score_list)
        if avg < 5.5:
            weak_areas.append(sub)
        elif avg >= 7.5:
            strong_areas.append(sub)

    return (weak_areas, strong_areas)
