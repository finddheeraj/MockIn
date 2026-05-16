"""
agents/resume_interviewer.py - Dedicated resume interview agent
----------------------------------------------------------------
Generates project- and skill-specific questions from a candidate resume.
Project and skill prompts are generated in parallel so this agent stays
separate from the live technical recruiter flow.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import MODEL, RECRUITER_TEMPERATURE

logger = logging.getLogger(__name__)

RESUME_AGENT_MAX_TOKENS = 900

SYSTEM_PROMPT = """You are a resume-specific interview question designer.
You read a candidate resume and create realistic interview questions about their actual projects, experience, and skills.

Rules:
- Ask questions an interviewer would naturally ask after reading the resume.
- Be specific to the resume. Mention concrete project names, technologies, metrics, domains, or claims when present.
- Do not invent experience that is not in the resume.
- Prefer questions that test ownership, tradeoffs, debugging, impact, and depth.
- Return only valid JSON with this shape:
{
  "questions": [
    {
      "category": "Project" | "Skill" | "Experience",
      "question": "string",
      "why": "short reason this question is relevant"
    }
  ]
}
"""


def _json_from_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.removeprefix("json").strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]

    return json.loads(text)


def _call_resume_agent(client, model_name: str, prompt: str) -> list:
    response = client.chat.completions.create(
        model=model_name or MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=RESUME_AGENT_MAX_TOKENS,
        temperature=RECRUITER_TEMPERATURE,
    )
    content = response.choices[0].message.content
    parsed = _json_from_response(content)
    return parsed.get("questions", [])


def _fallback_questions(parsed_resume, role: str, count: int) -> list:
    questions = []

    for project in parsed_resume.projects[:4]:
        first_line = project.splitlines()[0][:90]
        questions.append({
            "category": "Project",
            "question": f"Walk me through your work on {first_line}. What were the hardest technical decisions you personally made?",
            "why": "Targets a project listed on the resume.",
        })
        questions.append({
            "category": "Project",
            "question": f"If you had to scale or improve {first_line} today, what would you change and why?",
            "why": "Tests ownership, tradeoffs, and reflection.",
        })

    for skill in parsed_resume.skills[:6]:
        questions.append({
            "category": "Skill",
            "question": f"Your resume lists {skill}. Where did you use it most deeply, and what tradeoffs did you encounter?",
            "why": "Checks whether a listed skill is backed by practical experience.",
        })

    if not questions:
        questions.append({
            "category": "Experience",
            "question": f"Looking at your resume for a {role or 'target'} role, which project best represents your strongest work and why?",
            "why": "Uses the resume even when structured sections are sparse.",
        })

    return questions[:count]


def generate_resume_questions(client, parsed_resume, role: str = "", difficulty: str = "Mid-Level", model_name: str = None, count: int = 10) -> list:
    resume_text = parsed_resume.text[:12000]
    role_context = role.strip() or "the target role"

    prompts = {
        "project": (
            f"Target role: {role_context}\n"
            f"Difficulty: {difficulty}\n\n"
            "Create resume-specific interview questions focused on projects, ownership, architecture, tradeoffs, failures, and impact.\n\n"
            f"Resume:\n{resume_text}\n\n"
            "Return 5 questions."
        ),
        "skill": (
            f"Target role: {role_context}\n"
            f"Difficulty: {difficulty}\n\n"
            "Create resume-specific interview questions focused on listed skills, tools, frameworks, and technical depth.\n\n"
            f"Resume:\n{resume_text}\n\n"
            "Return 5 questions."
        ),
    }

    if not client:
        return _fallback_questions(parsed_resume, role_context, count)

    questions = []
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(_call_resume_agent, client, model_name, prompt): name
                for name, prompt in prompts.items()
            }
            for future in as_completed(futures):
                try:
                    questions.extend(future.result())
                except Exception as exc:
                    logger.warning("Resume %s question generation failed: %s", futures[future], exc)
    except Exception as exc:
        logger.warning("Resume agent failed, using fallback: %s", exc)

    clean = []
    seen = set()
    for item in questions:
        question = str(item.get("question", "")).strip()
        if not question or question.lower() in seen:
            continue
        seen.add(question.lower())
        clean.append({
            "category": str(item.get("category", "Resume")).strip() or "Resume",
            "question": question,
            "why": str(item.get("why", "")).strip(),
        })

    if len(clean) < min(count, 4):
        clean.extend(_fallback_questions(parsed_resume, role_context, count - len(clean)))

    return clean[:count]
