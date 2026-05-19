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

SYSTEM_PROMPT = """You are an interview strategy controller. Based on the candidate's performance, you decide what the human interviewer should do next.

Your output is a JSON object with a "recruiter_instructions" field.
This field must sound like a natural thought a human interviewer would have -- NOT a robotic command.

Bad example:  "Switch to weak area: databases. Probe further."
Good example: "The candidate is shaky on databases -- transition naturally with something like 'Let me take you in a slightly different direction and see how you think about data storage...'"

Bad example:  "Increase difficulty. Ask edge cases."
Good example: "They're handling this well -- it's time to raise the stakes. Push toward a system-design scenario that forces trade-off reasoning. Transition with something like 'Nice -- let's make things a bit messier. Imagine you're now dealing with...'"

Available actions:
- drill_deeper: The candidate showed partial knowledge -- dig into a specific detail they mentioned
- switch_to_weak_area: Move to a topic the candidate struggles with, but transition smoothly
- increase_difficulty: Candidate is doing well -- raise the stakes
- decrease_difficulty: Candidate is struggling -- give them a fairer angle on something related
- new_subtopic: Enough signal on the current subtopic -- open a fresh area naturally

Current interview context:
- Main topic: {topic}
- Candidate focus preference: {focus_preference}
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
  "recruiter_instructions": "Natural, human-sounding thought for the interviewer about what to do next and how to transition",
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
    focus_preference: str = "",
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

    focus = (focus_preference or "").strip() or "none (general coverage)"

    system = SYSTEM_PROMPT.format(
        topic=topic,
        focus_preference=focus,
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
                "recruiter_instructions": (
                    "The candidate is handling this well -- it's time to raise the stakes. "
                    "Transition naturally: 'Good, let's make this a bit more complex...' then present "
                    "a harder scenario involving trade-offs or scale."
                ),
                "reasoning": f"Score {score:.1f} exceeds threshold for difficulty increase.",
            }
    elif score <= ADAPTIVE_DECREASE_THRESHOLD:
        return {
                "action": "decrease_difficulty",
                "target_subtopic": current_subtopic,
                "target_difficulty": _prev_difficulty(current_difficulty),
                "recruiter_instructions": (
                    "The candidate is struggling a bit -- give them a more accessible angle. "
                    "Transition warmly: 'Let me reframe that a bit...' or 'Let's back up and approach this from a different angle.'"
                ),
                "reasoning": f"Score {score:.1f} below threshold -- reducing difficulty.",
            }
    elif score < ADAPTIVE_DRILL_THRESHOLD and weak_areas:
        area = weak_areas[0].replace("_", " ")
        return {
                "action": "switch_to_weak_area",
                "target_subtopic": weak_areas[0],
                "target_difficulty": current_difficulty,
                "recruiter_instructions": (
                    f"The candidate has a gap in {area} -- pivot there. "
                    f"Use a natural bridge: 'Let me shift gears and see how you think about {area}...'"
                ),
                "reasoning": "Low score and identified weak area to explore.",
        }
    else:
        return {
                "action": "drill_deeper",
                "target_subtopic": current_subtopic,
                "target_difficulty": current_difficulty,
                "recruiter_instructions": (
                    "Probe deeper on what they just said -- pick a specific detail or claim and ask "
                    "them to justify it, give a concrete example, or walk through an edge case."
                ),
                "reasoning": "Moderate score -- probing deeper for more signal.",
        }


_DIFFICULTY_ORDER = ["Junior", "Mid-Level", "Senior", "Staff / Principal"]


def _next_difficulty(current: str) -> str:
    idx = _DIFFICULTY_ORDER.index(current) if current in _DIFFICULTY_ORDER else 1
    return _DIFFICULTY_ORDER[min(idx + 1, len(_DIFFICULTY_ORDER) - 1)]


def _prev_difficulty(current: str) -> str:
    idx = _DIFFICULTY_ORDER.index(current) if current in _DIFFICULTY_ORDER else 1
    return _DIFFICULTY_ORDER[max(idx - 1, 0)]
