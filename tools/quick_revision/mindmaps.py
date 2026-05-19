"""Quick revision concept mind maps."""

from .store import merge_topic_files

_cache: dict | None = None


def _load_mindmaps() -> dict:
    global _cache
    if _cache is not None:
        return _cache

    _cache = merge_topic_files("*_mindmaps.json")
    return _cache


def get_quick_revision_mindmap(topic: str, subtopic: str) -> dict | None:
    topic_data = _load_mindmaps().get(topic, {})
    if not isinstance(topic_data, dict):
        return None
    mindmap = topic_data.get(subtopic)
    if not isinstance(mindmap, dict) or not mindmap.get("label"):
        return None
    return mindmap
