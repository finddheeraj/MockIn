import { apiGenerateResumeQuestions } from "./api.js";
import { escapeHtml, showToast } from "./ui.js";

function _renderResumeQuestions(questions) {
  if (!questions || questions.length === 0) {
    return '<div class="qs-error">No resume-specific questions generated yet.</div>';
  }

  return questions.map((item, index) => `
    <div class="qs-qa-item">
      <div class="qs-question" onclick="toggleQAItem(this)">
        <span class="qs-q-num">${index + 1}.</span>
        <span class="qs-q-text">${escapeHtml(item.question || "")}</span>
        <span class="resume-q-category">${escapeHtml(item.category || "Resume")}</span>
        <svg class="qs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="qs-answer">
        <div class="qs-answer-text">
          <div class="qs-answer-section">Why this question</div>
          <p class="qs-answer-paragraph">${escapeHtml(item.why || "This question is tailored to the projects, skills, or experience found in the uploaded resume.")}</p>
        </div>
      </div>
    </div>
  `).join("");
}

function _openResumeModal() {
  const overlay = document.getElementById("resume-modal-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  overlay.onclick = (e) => {
    if (e.target === overlay) closeResumeQuestions();
  };
}

function _setResumeLoading(isLoading) {
  const btn = document.getElementById("btn-resume-questions");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Reading Resume..." : "Generate Resume Questions";
}

export async function generateResumeQuestions() {
  const fileInput = document.getElementById("resume-upload");
  const roleInput = document.getElementById("resume-role");
  const difficulty = document.getElementById("difficulty-select").value;
  const output = document.getElementById("resume-questions-output");
  const modal = document.getElementById("resume-questions-preview");

  const file = fileInput?.files?.[0];
  if (!file) {
    showToast("Please upload your resume first.");
    return;
  }

  _setResumeLoading(true);
  output.innerHTML = '<div class="resume-loading">Reading the resume and creating targeted questions...</div>';
  _openResumeModal();
  modal.innerHTML = '<div class="qs-loading">Reading the resume and creating targeted questions...</div>';

  try {
    const data = await apiGenerateResumeQuestions(file, roleInput?.value || "", difficulty);
    if (data.error) {
      output.innerHTML = '<div class="resume-empty">Upload a resume to get targeted interview questions.</div>';
      modal.innerHTML = `<div class="qs-error">${escapeHtml(data.error)}</div>`;
      return;
    }

    const role = roleInput?.value?.trim();
    const meta = role ? `${role} • ${difficulty}` : `Resume • ${difficulty}`;
    const warnings = (data.warnings || []).map(w => `<div class="resume-warning">${escapeHtml(w)}</div>`).join("");

    modal.innerHTML = `
      <div class="qs-header">
        <div class="qs-header-left">
          <span class="qs-title">Resume-Specific Questions</span>
          <span class="qs-meta">${escapeHtml(meta)}</span>
        </div>
        <button class="qs-close" onclick="closeResumeQuestions()">×</button>
      </div>
      ${warnings}
      <div id="resume-qs-pairs-container">
        ${_renderResumeQuestions(data.questions || [])}
      </div>
    `;
    output.innerHTML = `<div class="resume-empty">${(data.questions || []).length} resume-specific questions generated.</div>`;
  } catch (err) {
    console.error("generateResumeQuestions error:", err);
    output.innerHTML = '<div class="resume-empty">Upload a resume to get targeted interview questions.</div>';
    modal.innerHTML = '<div class="qs-error">Failed to generate resume questions. Try again.</div>';
  } finally {
    _setResumeLoading(false);
  }
}

export function closeResumeQuestions() {
  const overlay = document.getElementById("resume-modal-overlay");
  if (overlay) overlay.style.display = "none";
}

export function initResumeUpload() {
  const input = document.getElementById("resume-upload");
  const label = document.querySelector(".resume-upload span");
  if (!input || !label) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    label.textContent = file ? file.name : "Upload Resume";
  });
}
