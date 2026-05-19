"""Quick revision question bank."""

from .store import merge_topic_files

_cache: dict | None = None


def _load_questions() -> dict:
    global _cache
    if _cache is not None:
        return _cache

    merged = merge_topic_files("*.json", skip_suffix="_mindmaps.json")
    if not merged:
        from .store import QUICKREVISION_DIR

        raise FileNotFoundError(
            f"No question JSON files found in {QUICKREVISION_DIR!r}. "
            "Add at least one revision question file there."
        )

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
