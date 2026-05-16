"""
routes/resume.py - Resume question API
--------------------------------------
Handles resume uploads and delegates targeted question generation to the
dedicated resume interviewer agent.
"""

import logging

from flask import Blueprint, jsonify, request

from agents.resume_interviewer import generate_resume_questions
from config import LLM_PROVIDER, MODEL, LOCAL_MODEL_NAME
from llm_client import get_grok_client, get_local_client
from tools.resume_parser import parse_resume

logger = logging.getLogger(__name__)

resume_bp = Blueprint("resume", __name__)


def _get_primary_client() -> tuple:
    if LLM_PROVIDER in ("local",):
        return (get_local_client(), LOCAL_MODEL_NAME)
    return (get_grok_client(), MODEL)


@resume_bp.route("/resume-questions", methods=["POST"])
def resume_questions():
    resume_file = request.files.get("resume")
    role = request.form.get("role", "").strip()
    difficulty = request.form.get("difficulty", "Mid-Level").strip()

    if not resume_file or not resume_file.filename:
        return jsonify({"error": "Upload a resume first."}), 400

    try:
        file_bytes = resume_file.read()
        parsed = parse_resume(resume_file.filename, file_bytes)
    except Exception as exc:
        logger.warning("Resume parse failed: %s", exc)
        return jsonify({"error": str(exc)}), 400

    try:
        client, model_name = _get_primary_client()
        questions = generate_resume_questions(
            client,
            parsed,
            role=role,
            difficulty=difficulty,
            model_name=model_name,
            count=10,
        )
    except Exception as exc:
        logger.warning("Resume AI generation failed, using fallback: %s", exc)
        questions = generate_resume_questions(
            None,
            parsed,
            role=role,
            difficulty=difficulty,
            count=10,
        )

    return jsonify({
        "questions": questions,
        "skills": parsed.skills[:12],
        "projects": [p.splitlines()[0][:120] for p in parsed.projects[:5]],
        "warnings": parsed.warnings,
    })
