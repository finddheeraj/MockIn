"""
routes/pages.py — Page Routes
-------------------------------
Handles simple HTML page rendering.
Kept separate from API routes so each file has one clear job.
"""

from flask import Blueprint, render_template
from config import TOPICS, DIFFICULTIES

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    """Render the main app page."""
    return render_template("index.html", topics=TOPICS, difficulties=DIFFICULTIES)
