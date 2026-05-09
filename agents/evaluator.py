"""
agents/evaluator.py — End-of-Session Evaluator
-----------------------------------------------
Synthesizes the full interview session into a structured scorecard,
identifies patterns, and generates a concrete improvement plan.
Called once when the user ends the session.
"""

import json
from config import MODEL, EVALUATOR_MAX_TOKENS, EVALUATOR_TEMPERATURE

SYSTEM_PROMPT = """You are a senior technical interview evaluator. You have observed an entire mock interview session and must produce a comprehensive evaluation.

Analyze the full transcript, per-round scores, and adaptive decisions to produce a structured assessment.

Interview context:
- Topic: {topic}
- Starting difficulty: {difficulty}
- Rounds completed: {rounds}
- Score progression: {score_progression}
- Weak areas identified: {weak_areas}
- Strong areas identified: {strong_areas}

RESPOND ONLY WITH VALID JSON in this exact format:
{{
  "overall_grade": "B+",
  "overall_score": 6.8,
  "dimension_averages": {{
    "clarity": 7.2,
    "depth": 5.8,
    "accuracy": 7.0,
    "examples": 6.0,
    "structure": 7.5
  }},
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "patterns": ["pattern 1", "pattern 2"],
  "improvement_plan": [
    {{
      "area": "area name",
      "action": "specific action to take",
      "priority": "high",
      "resources": "suggested study material or practice"
    }}
  ],
  "summary": "2-3 paragraph narrative summary of the interview performance."
}}
"""


def evaluate_session(
    client,
    topic: str,
    difficulty: str,
    history: list,
    scores: list,
    adaptive_state: dict,
    model_name: str = None,
) -> dict:
    """
    Produce a comprehensive end-of-session evaluation.
    Returns structured scorecard + improvement plan.
    """
    score_progression = [f"R{i+1}:{s.get('overall', 5.0):.1f}" for i, s in enumerate(scores)]
    weak_areas = adaptive_state.get("weak_areas", [])
    strong_areas = adaptive_state.get("strong_areas", [])

    system = SYSTEM_PROMPT.format(
        topic=topic,
        difficulty=difficulty,
        rounds=len(scores),
        score_progression=", ".join(score_progression) if score_progression else "no scores",
        weak_areas=", ".join(weak_areas) if weak_areas else "none identified",
        strong_areas=", ".join(strong_areas) if strong_areas else "none identified",
    )

    transcript_lines = []
    for msg in history:
        speaker = "INTERVIEWER" if msg["role"] == "assistant" else "CANDIDATE"
        transcript_lines.append(f"{speaker}: {msg['content']}")
    transcript = "\n\n".join(transcript_lines)

    user_content = (
        f"Full interview transcript:\n\n{transcript}\n\n"
        f"Per-round scores: {json.dumps(scores, indent=2)}\n\n"
        "Produce your comprehensive evaluation. Respond with JSON only."
    )

    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        max_tokens=EVALUATOR_MAX_TOKENS,
        temperature=EVALUATOR_TEMPERATURE,
    )

    raw = response.choices[0].message.content.strip()

    try:
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)

        return {
            "overall_grade": result.get("overall_grade", "N/A"),
            "overall_score": float(result.get("overall_score", 5.0)),
            "dimension_averages": result.get("dimension_averages", {}),
            "strengths": result.get("strengths", []),
            "weaknesses": result.get("weaknesses", []),
            "patterns": result.get("patterns", []),
            "improvement_plan": result.get("improvement_plan", []),
            "summary": result.get("summary", "Evaluation could not be generated."),
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        return _fallback_evaluation(scores, weak_areas, strong_areas)


def _fallback_evaluation(scores: list, weak_areas: list, strong_areas: list) -> dict:
    """Generate basic evaluation from raw score data when LLM parsing fails."""
    if not scores:
        return {
            "overall_grade": "N/A",
            "overall_score": 0.0,
            "dimension_averages": {},
            "strengths": [],
            "weaknesses": [],
            "patterns": [],
            "improvement_plan": [],
            "summary": "Not enough data to generate evaluation.",
        }

    avg_score = sum(s.get("overall", 5.0) for s in scores) / len(scores)
    grade = _score_to_grade(avg_score)

    dim_totals = {"clarity": 0, "depth": 0, "accuracy": 0, "examples": 0, "structure": 0}
    for s in scores:
        for dim in dim_totals:
            dim_totals[dim] += s.get("dimensions", {}).get(dim, 5)
    dim_averages = {k: round(v / len(scores), 1) for k, v in dim_totals.items()}

    return {
        "overall_grade": grade,
        "overall_score": round(avg_score, 1),
        "dimension_averages": dim_averages,
        "strengths": [a.replace("_", " ").title() for a in strong_areas[:3]],
        "weaknesses": [a.replace("_", " ").title() for a in weak_areas[:3]],
        "patterns": [],
        "improvement_plan": [
            {"area": a.replace("_", " ").title(), "action": "Practice more problems in this area", "priority": "high", "resources": "Review fundamentals and do mock problems"}
            for a in weak_areas[:3]
        ],
        "summary": f"Overall score: {avg_score:.1f}/10 ({grade}). Focus on improving: {', '.join(weak_areas[:3]) if weak_areas else 'general depth'}.",
    }


def _score_to_grade(score: float) -> str:
    if score >= 9.0: return "A+"
    if score >= 8.5: return "A"
    if score >= 8.0: return "A-"
    if score >= 7.5: return "B+"
    if score >= 7.0: return "B"
    if score >= 6.5: return "B-"
    if score >= 6.0: return "C+"
    if score >= 5.5: return "C"
    if score >= 5.0: return "C-"
    if score >= 4.0: return "D"
    return "F"
