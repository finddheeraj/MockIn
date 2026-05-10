"""
cache.py — Dual-Layer LLM Response Cache
-----------------------------------------
Layer 1: In-process LRU dict (fast, zero I/O, lost on restart)
Layer 2: Filesystem JSON store (survives Render restarts / cold starts)

No Redis, no external services, no extra dependencies — pure stdlib.

Cache targets:
  - ask_opening_question  → keyed by (topic, difficulty)             [filesystem]
  - score_answer          → keyed by (topic, difficulty, q, answer)  [in-process]
  - get_feedback (coach)  → keyed by (topic, difficulty, q, answer)  [in-process]
  - generate_answer       → keyed by (topic, difficulty, question)   [filesystem]

NOT cached (dynamic / conversation-dependent):
  - ask_followup          (depends on live history)
  - decide_next_action    (depends on evolving adaptive state)
  - close_session         (one-shot per session)
  - evaluate_session      (one-shot per session)
"""

import hashlib
import json
import os
import logging

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

# Max entries kept in the in-process dict before LRU eviction
_LRU_MAX_SIZE = 512

# Directory for filesystem-persisted cache entries
_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "flask_sessions", "_llm_cache")

# ── Internal state ────────────────────────────────────────────────────────────

# Ordered dict used as LRU: most-recently used at the end
try:
    from collections import OrderedDict
    _lru: OrderedDict = OrderedDict()
except ImportError:
    _lru = {}

_fs_ready = False


def _ensure_fs() -> bool:
    """Create the cache directory if it doesn't exist. Returns True on success."""
    global _fs_ready
    if _fs_ready:
        return True
    try:
        os.makedirs(_CACHE_DIR, exist_ok=True)
        _fs_ready = True
        return True
    except OSError as exc:
        logger.warning("LLM cache: cannot create cache dir %s: %s", _CACHE_DIR, exc)
        return False


# ── Key generation ────────────────────────────────────────────────────────────

def make_key(*args) -> str:
    """
    Deterministic MD5 hex key from any number of string arguments.
    Usage: make_key("scorer", topic, difficulty, question, answer)
    """
    payload = json.dumps(args, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


# ── In-process LRU cache ──────────────────────────────────────────────────────

def lru_get(key: str):
    """Return cached value or None. Moves hit to end (most-recently used)."""
    if key in _lru:
        _lru.move_to_end(key)
        return _lru[key]
    return None


def lru_set(key: str, value) -> None:
    """Store value. Evicts the least-recently used entry when over capacity."""
    if key in _lru:
        _lru.move_to_end(key)
    _lru[key] = value
    if len(_lru) > _LRU_MAX_SIZE:
        _lru.popitem(last=False)  # remove oldest


# ── Filesystem cache ──────────────────────────────────────────────────────────

def _fs_path(key: str) -> str:
    return os.path.join(_CACHE_DIR, key + ".json")


def fs_get(key: str):
    """Return filesystem-cached value or None."""
    if not _ensure_fs():
        return None
    try:
        with open(_fs_path(key), "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def fs_set(key: str, value) -> None:
    """Persist value to filesystem as JSON."""
    if not _ensure_fs():
        return
    try:
        with open(_fs_path(key), "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False)
    except OSError as exc:
        logger.warning("LLM cache: failed to write %s: %s", key, exc)


# ── Convenience helpers used by agents ───────────────────────────────────────

def get_lru(key: str):
    """Public alias for lru_get."""
    return lru_get(key)


def set_lru(key: str, value) -> None:
    """Public alias for lru_set."""
    lru_set(key, value)


def get_fs(key: str):
    """Public alias for fs_get."""
    return fs_get(key)


def set_fs(key: str, value) -> None:
    """Public alias for fs_set."""
    fs_set(key, value)


# ── Stats (optional, useful for debugging) ────────────────────────────────────

def stats() -> dict:
    """Return a snapshot of current cache sizes."""
    fs_count = 0
    if _ensure_fs():
        try:
            fs_count = len([f for f in os.listdir(_CACHE_DIR) if f.endswith(".json")])
        except OSError:
            pass
    return {
        "lru_entries": len(_lru),
        "lru_max": _LRU_MAX_SIZE,
        "fs_entries": fs_count,
        "fs_dir": _CACHE_DIR,
    }
