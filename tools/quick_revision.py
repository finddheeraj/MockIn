"""
tools/quick_revision.py - JSON-backed quick revision question bank.

Loads all JSON files from data/Quickrevision/ and merges them into a
single question bank. To add a new topic, drop a new JSON file in that
directory — no code changes needed.

Each file must follow the same structure:
{
  "<Topic Name>": {
    "<Subtopic Name>": [
      { "question": "...", "answer": "..." },
      ...
    ]
  }
}
"""

import json
import os
import glob


_QUICKREVISION_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data", "Quickrevision"
)
_cache = None


def _load_questions() -> dict:
    """
    Merge all *.json files in data/Quickrevision/ into one dict.
    If two files define the same top-level topic key, their subtopics
    are merged (subtopics from the later file win on collision).
    """
    global _cache
    if _cache is not None:
        return _cache

    merged: dict = {}
    pattern = os.path.join(_QUICKREVISION_DIR, "*.json")
    files = sorted(glob.glob(pattern))  # sorted for deterministic merge order

    if not files:
        raise FileNotFoundError(
            f"No JSON files found in {_QUICKREVISION_DIR!r}. "
            "Add at least one revision question file there."
        )

    for filepath in files:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        for topic, subtopics in data.items():
            if topic not in merged:
                merged[topic] = {}
            if isinstance(subtopics, dict):
                merged[topic].update(subtopics)

    _cache = merged
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