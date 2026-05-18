"""
tools/quick_revision.py - JSON-backed quick revision question bank.

Loads all JSON files from data/Quickrevision/ and merges them into a
single question bank. To add a new topic, drop a new JSON file in that
directory — no code changes needed.

Question files (*.json, excluding *_mindmaps.json) must follow:
{
  "<Topic Name>": {
    "<Subtopic Name>": [
      { "question": "...", "answer": "..." },
      ...
    ]
  }
}

Mind map files (*_mindmaps.json) must follow:
{
  "<Topic Name>": {
    "<Subtopic Name>": {
      "label": "Root label",
      "children": [ { "label": "...", "children": [...] }, ... ]
    }
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
_mindmap_cache = None


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
        if filepath.endswith("_mindmaps.json"):
            continue
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
    if not isinstance(questions, list):
        return []
    return [
        {
            "question": str(q.get("question", "")).strip(),
            "answer": str(q.get("answer", "")).strip(),
        }
        for q in questions
        if isinstance(q, dict) and str(q.get("question", "")).strip()
    ]


def _load_mindmaps() -> dict:
    """
    Merge all *_mindmaps.json files in data/Quickrevision/ into one dict.
    Structure per subtopic: { "label": "...", "children": [ ... ] }
    """
    global _mindmap_cache
    if _mindmap_cache is not None:
        return _mindmap_cache

    merged: dict = {}
    pattern = os.path.join(_QUICKREVISION_DIR, "*_mindmaps.json")
    files = sorted(glob.glob(pattern))

    for filepath in files:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        for topic, subtopics in data.items():
            if topic not in merged:
                merged[topic] = {}
            if isinstance(subtopics, dict):
                merged[topic].update(subtopics)

    _mindmap_cache = merged
    return _mindmap_cache


def get_quick_revision_mindmap(topic: str, subtopic: str) -> dict | None:
    topic_data = _load_mindmaps().get(topic, {})
    if not isinstance(topic_data, dict):
        return None
    mindmap = topic_data.get(subtopic)
    if not isinstance(mindmap, dict) or not mindmap.get("label"):
        return None
    return mindmap