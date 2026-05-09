"""
config.py — App Configuration
------------------------------
All constants, environment variables, and static data live here.
Change topics/difficulties/model settings without touching logic files.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Provider Selection ───────────────────────────────────────────────────────
# "grok", "local", or "both"
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "grok").lower()

# ── Grok API (xAI) ──────────────────────────────────────────────────────────

XAI_API_KEY  = os.environ.get("XAI_API_KEY", "")
XAI_BASE_URL = "https://api.groq.com/openai/v1"
MODEL        = "llama-3.1-8b-instant"

# ── Local Llama Model ────────────────────────────────────────────────────────

LOCAL_MODEL_PATH         = os.environ.get("LOCAL_MODEL_PATH", "")
LOCAL_MODEL_CONTEXT_SIZE = int(os.environ.get("LOCAL_MODEL_CONTEXT_SIZE", "4096"))
LOCAL_MODEL_GPU_LAYERS   = int(os.environ.get("LOCAL_MODEL_GPU_LAYERS", "0"))
LOCAL_MODEL_NAME         = "Llama-3.1-8B"

# ── Shared generation settings ───────────────────────────────────────────────

RECRUITER_MAX_TOKENS  = 300
COACH_MAX_TOKENS      = 350
RECRUITER_TEMPERATURE = 0.7
COACH_TEMPERATURE     = 0.6

# ── Scorer settings ──────────────────────────────────────────────────────────

SCORER_MAX_TOKENS     = 400
SCORER_TEMPERATURE    = 0.3

# ── Adaptive Controller settings ─────────────────────────────────────────────

ADAPTIVE_MAX_TOKENS   = 250
ADAPTIVE_TEMPERATURE  = 0.4
ADAPTIVE_DRILL_THRESHOLD    = 5.0
ADAPTIVE_SWITCH_THRESHOLD   = 3
ADAPTIVE_INCREASE_THRESHOLD = 8.0
ADAPTIVE_DECREASE_THRESHOLD = 3.0

# ── Evaluator settings ───────────────────────────────────────────────────────

EVALUATOR_MAX_TOKENS  = 1000
EVALUATOR_TEMPERATURE = 0.5

# ── Scoring rubric ───────────────────────────────────────────────────────────

SCORING_DIMENSIONS = {
    "clarity":   {"weight": 0.20, "description": "Clear communication, well-organized"},
    "depth":     {"weight": 0.25, "description": "Technical depth, covers edge cases"},
    "accuracy":  {"weight": 0.25, "description": "Factually correct, no misconceptions"},
    "examples":  {"weight": 0.15, "description": "Uses concrete examples, real tools"},
    "structure": {"weight": 0.15, "description": "Logical flow, structured approach"},
}

# ── Session limits ───────────────────────────────────────────────────────────

MAX_ROUNDS_PER_SESSION = 10
MIN_ROUNDS_FOR_EVAL    = 2

# ── Interview options ─────────────────────────────────────────────────────────

TOPICS = [
    # ── Technology ───────────────────────────────────────────────────────────
    "System Design",
    "Data Structures & Algorithms",
    "Python",
    "JavaScript / Frontend",
    "Machine Learning",
    "Data Science",
    "Artificial Intelligence",
    "Agentic AI",
    "Generative AI",
    "Databases & SQL",
    "DevOps & CI/CD",
    "Cloud (AWS / GCP / Azure)",
    "Object-Oriented Programming",
    "APIs & REST",
    "Security & Authentication",
    "Scrum Master",
    # ── General Industry ─────────────────────────────────────────────────────
    "Behavioral / Leadership",
    "Marketing & Digital Marketing",
    "Sales & Business Development",
    "Finance & Accounting",
    "Product Management",
    "Human Resources",
    "Project Management",
    "Data Analytics & Business Intelligence",
    "Consulting & Strategy",
    "Operations & Supply Chain",
]

DIFFICULTIES = ["Junior", "Mid-Level", "Senior", "Staff / Principal"]
