"""
Quick revision data layer.

Question bank:  data/Quickrevision/*.json (excluding *_mindmaps.json)
Mind maps:      data/Quickrevision/*_mindmaps.json
"""

from .questions import (
    get_quick_revision_topics,
    get_quick_revision_subtopics,
    get_quick_revision_questions,
)
from .mindmaps import get_quick_revision_mindmap

__all__ = [
    "get_quick_revision_topics",
    "get_quick_revision_subtopics",
    "get_quick_revision_questions",
    "get_quick_revision_mindmap",
]
