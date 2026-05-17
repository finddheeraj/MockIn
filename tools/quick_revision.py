"""
tools/quick_revision.py - JSON-backed quick revision question bank.
"""

import json
import os


_QUESTIONS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "quick_revision_questions.json"
)
_cache = None


def _load_questions() -> dict:
    global _cache
    if _cache is None:
        with open(_QUESTIONS_PATH, "r", encoding="utf-8") as f:
            _cache = json.load(f)
    return _cache


def get_quick_revision_topics() -> list:
    return sorted(_load_questions().keys())


def get_quick_revision_subtopics(topic: str) -> list:
    topic_data = _load_questions().get(topic, {})
    if not isinstance(topic_data, dict):
        return []
    return sorted(topic_data.keys())


def get_quick_revision_questions(topic: str, subtopic: str) -> list:
    topic_data = _load_questions().get(topic, {})
    questions = topic_data.get(subtopic, []) if isinstance(topic_data, dict) else []
    return [
        {
            "question": str(q.get("question", "")).strip(),
            "answer": str(q.get("answer", "")).strip(),
        }
        for q in questions
        if isinstance(q, dict) and str(q.get("question", "")).strip()
    ]
