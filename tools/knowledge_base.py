"""
tools/knowledge_base.py — Reference Knowledge Base Tool
---------------------------------------------------------
Provides agents with ideal answers and key concepts for each topic/subtopic.
Acts as a deterministic "tool" — pure Python lookup, no LLM calls.

Reference data is split into per-topic JSON files under data/references/.
"""

import json
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
        result["difficulty_expectation"] = entry["difficulty_expectations"].get(difficulty, "")

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
