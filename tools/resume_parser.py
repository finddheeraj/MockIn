"""
tools/resume_parser.py - Resume parsing helpers
------------------------------------------------
Extracts text and lightweight structure from uploaded resumes.
PDF/DOCX support uses optional dependencies listed in requirements.txt.
"""

import io
import re
from dataclasses import dataclass


SUPPORTED_EXTENSIONS = {"txt", "md", "pdf", "docx"}
MAX_RESUME_CHARS = 18000


@dataclass
class ResumeParseResult:
    text: str
    sections: dict
    skills: list
    projects: list
    warnings: list


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _read_text_file(file_bytes: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="ignore")


def _read_pdf(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF parsing requires the pypdf package.") from exc

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def _read_docx(file_bytes: bytes) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("DOCX parsing requires the python-docx package.") from exc

    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_resume_text(filename: str, file_bytes: bytes) -> tuple:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("Upload a TXT, MD, PDF, or DOCX resume.")

    if extension in ("txt", "md"):
        text = _read_text_file(file_bytes)
    elif extension == "pdf":
        text = _read_pdf(file_bytes)
    elif extension == "docx":
        text = _read_docx(file_bytes)
    else:
        text = ""

    return _normalize_text(text), extension


def _split_sections(text: str) -> dict:
    known = {
        "summary", "profile", "experience", "work experience", "employment",
        "projects", "project experience", "skills", "technical skills",
        "education", "certifications", "achievements", "publications",
    }
    sections = {}
    current = "overview"
    sections[current] = []

    for line in text.splitlines():
        clean = line.strip().strip(":")
        key = clean.lower()
        if key in known and len(clean.split()) <= 3:
            current = key
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)

    return {
        name: _normalize_text("\n".join(lines))
        for name, lines in sections.items()
        if _normalize_text("\n".join(lines))
    }


def _extract_skills(sections: dict) -> list:
    skill_text = sections.get("skills") or sections.get("technical skills") or ""
    if not skill_text:
        return []

    parts = re.split(r"[,|;/\n]+", skill_text)
    skills = []
    for part in parts:
        item = re.sub(r"^[A-Za-z ]+:\s*", "", part).strip(" -")
        if 1 <= len(item) <= 40 and item.lower() not in {"skills", "technical skills"}:
            skills.append(item)

    deduped = []
    seen = set()
    for skill in skills:
        key = skill.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(skill)
    return deduped[:20]


def _extract_projects(sections: dict) -> list:
    project_text = sections.get("projects") or sections.get("project experience") or ""
    if not project_text:
        return []

    chunks = re.split(r"\n\s*(?:[-*]\s+)?(?=[A-Z][A-Za-z0-9 /&().-]{3,80}(?:\n|:))", project_text)
    projects = []
    for chunk in chunks:
        clean = _normalize_text(chunk)
        if len(clean) >= 20:
            projects.append(clean[:700])
    return projects[:8]


def parse_resume(filename: str, file_bytes: bytes) -> ResumeParseResult:
    warnings = []
    text, extension = extract_resume_text(filename, file_bytes)

    if not text:
        raise ValueError("Could not extract text from this resume.")

    if len(text) > MAX_RESUME_CHARS:
        text = text[:MAX_RESUME_CHARS]
        warnings.append("Resume text was truncated before question generation.")

    sections = _split_sections(text)
    skills = _extract_skills(sections)
    projects = _extract_projects(sections)

    if extension in {"pdf", "docx"} and not sections:
        warnings.append("Resume text was extracted, but sections were hard to detect.")

    return ResumeParseResult(
        text=text,
        sections=sections,
        skills=skills,
        projects=projects,
        warnings=warnings,
    )
