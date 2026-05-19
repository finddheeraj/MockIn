"""Shared JSON loading utilities for quick revision data."""

import json
import os
import glob

QUICKREVISION_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "Quickrevision"
)


def merge_topic_files(pattern: str, *, skip_suffix: str | None = None) -> dict:
    """
    Load and merge JSON files matching pattern into { topic: { subtopic: data } }.
    """
    merged: dict = {}
    files = sorted(glob.glob(os.path.join(QUICKREVISION_DIR, pattern)))

    for filepath in files:
        if skip_suffix and filepath.endswith(skip_suffix):
            continue
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        for topic, subtopics in data.items():
            if topic not in merged:
                merged[topic] = {}
            if isinstance(subtopics, dict):
                merged[topic].update(subtopics)

    return merged
