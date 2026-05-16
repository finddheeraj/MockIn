"""
tools/knowledge_base.py — Reference Knowledge Base Tool
---------------------------------------------------------
Provides agents with ideal answers and key concepts for each topic/subtopic.
Acts as a deterministic "tool" — pure Python lookup, no LLM calls.

Reference data is split into per-topic JSON files under data/references/.
"""

import json
from multiprocessing import pool
import os
import glob

_REFERENCES_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "references")
_kb_cache = None


def _load_kb() -> dict:
    global _kb_cache
    if _kb_cache is None:
        _kb_cache = {}
        for filepath in glob.glob(os.path.join(_REFERENCES_DIR, "*.json")):
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                _kb_cache.update(data)
    return _kb_cache


def lookup_reference(topic: str, subtopic: str = None, difficulty: str = None) -> dict:
    """
    Look up reference material for a given topic/subtopic.

    Returns:
        {
            "key_concepts": [str],
            "ideal_answer_points": [str],
            "common_mistakes": [str],
            "follow_up_areas": [str],
            "difficulty_expectation": str,   (for the given difficulty level)
        }
    Returns empty dict if topic/subtopic not found.
    """
    kb = _load_kb()
    topic_data = kb.get(topic, {})

    if not topic_data:
        return {}

    if subtopic:
        entry = topic_data.get(subtopic, {})
    else:
        first_key = next(iter(topic_data), None)
        entry = topic_data.get(first_key, {}) if first_key else {}

    if not entry:
        return {}

    result = {
        "key_concepts": entry.get("key_concepts", []),
        "ideal_answer_points": entry.get("ideal_answer_points", []),
        "common_mistakes": entry.get("common_mistakes", []),
        "follow_up_areas": entry.get("follow_up_areas", []),
    }

    if difficulty and "difficulty_expectations" in entry:
        de = entry["difficulty_expectations"]
        if isinstance(de, dict):
            result["difficulty_expectation"] = de.get(difficulty, "")
        elif isinstance(de, list):
            # Malformed JSON: list of "Level: description" strings — parse on the fly
            for item in de:
                if isinstance(item, str) and item.startswith(difficulty + ":"):
                    result["difficulty_expectation"] = item.partition(":")[2].strip()
                    break
            else:
                result["difficulty_expectation"] = ""

    return result


def detect_subtopic(question: str, topic: str) -> str:
    """
    Infer which subtopic a recruiter question maps to via keyword matching.
    Returns the best-matching subtopic key, or the first subtopic if no match.
    """
    kb = _load_kb()
    topic_data = kb.get(topic, {})

    if not topic_data:
        return ""

    question_lower = question.lower()
    best_match = ""
    best_score = 0

    for subtopic_key, entry in topic_data.items():
        score = 0
        keywords = subtopic_key.replace("_", " ").split()
        for kw in keywords:
            if kw in question_lower:
                score += 2

        for concept in entry.get("key_concepts", []):
            if concept.lower() in question_lower:
                score += 1

        if score > best_score:
            best_score = score
            best_match = subtopic_key

    if not best_match:
        best_match = next(iter(topic_data), "")

    return best_match


def get_all_subtopics(topic: str) -> list:
    """Return all available subtopics for a given topic."""
    kb = _load_kb()
    return list(kb.get(topic, {}).keys())

_QUESTION_TEMPLATES = [
    "Can you explain {concept} and its significance in {topic}?",
    "How does {concept} work, and when would you use it?",
    "What are the key considerations when working with {concept}?",
    "Walk me through through your approch to {concept}",
    "What is {concept}? Can you describe a real world usecase?",
    "How would you compare different apporoaches to {concept}?",
    "What common mistakes are made with {concept}, and how would you avoid them?",
    "Describe the tradeoffs onvolved when using {concept} in a project.",
]

_DIFFICULTY_CONCEPT_INDEX = {"junior": 0, "Mid-Level": 1, "Senior": 2, "Staff/Principal": 3}

def get_prep_questions(topic: str, difficulty: str, count: int = 10, offset: int=0) -> list:
    """
    Generate prep questions based on key concepts for the given topic/subtopic/difficulty.
    Uses predefined templates and fills in with relevant key concepts.
    """
    kb = _load_kb()
    topic_data = kb.get(topic, {})
    
    if not topic_data:
        return []

    subtopics = list(topic_data.keys())
    max_concepts = max((len(v.get("key_concepts", [])) for v in topic_data.values()), default=0)
    pool = []
    
    for round_idx in range(max_concepts):
        for subtopic in subtopics:
            entry = topic_data[subtopic]
            concepts = entry.get("key_concepts", [])
            if round_idx >= len(concepts):
                continue
            
            concept = concepts[round_idx]
            template = _QUESTION_TEMPLATES[len(pool) % len(_QUESTION_TEMPLATES)]
            question = template.format(
                concept=concept,
                topic=topic,
                subtopic=subtopic.replace("_", " ").title(),
            )
            
            ideal_points = entry.get("ideal_answer_points", [])
            key_concepts  = entry.get("key_concepts", [])
            common_mistakes = entry.get("common_mistakes", [])

            answer_lines = []

            # Full answer points
            if ideal_points:
                answer_lines.append("What to cover:")
                answer_lines += [f"  • {pt}" for pt in ideal_points]

            # Key concepts
            if key_concepts:
                answer_lines.append("\nKey concepts to mention:")
                answer_lines += [f"  • {kc}" for kc in key_concepts]

            # Common mistakes
            if common_mistakes:
                answer_lines.append("\nCommon mistakes to avoid:")
                answer_lines += [f"  • {m}" for m in common_mistakes]

            # Level expectation
            diff_exp = entry.get("difficulty_expectations", {})
            if isinstance(diff_exp, dict):
                exp = diff_exp.get(difficulty, "")
                if exp:
                    answer_lines.append(f"\nExpected at {difficulty} level:\n  {exp}")
                    
            pool.append({
                "question": question,
                "ideal_answer": "\n".join(answer_lines)
            })
    return pool[offset:offset+count]