/**
 * panels.js
 * ──────────
 * - Adaptive difficulty chip
 * - Coach answer modal (Get Coach Answer button)
 * - Evaluation overlay
 */

import { escapeHtml, showToast } from "./ui.js";
import { state } from "./state.js";

/* ── Adaptive difficulty indicator ──────────────────────────────────────── */

const ACTION_LABELS = {
  drill_deeper:        "Drilling deeper",
  switch_to_weak_area: "Switching topic",
  increase_difficulty: "Increasing difficulty",
  decrease_difficulty: "Easing up",
  new_subtopic:        "New subtopic",
};

export function updateAdaptiveIndicator(adaptiveData) {
  if (!adaptiveData) return;
  const chip = document.getElementById("chip-adaptive");
  chip.textContent   = ACTION_LABELS[adaptiveData.action] || adaptiveData.action;
  chip.style.display = "inline-block";
  chip.title         = adaptiveData.reasoning || "";
}

/* ── Coach answer modal ──────────────────────────────────────────────────── */

export function renderCoachAnswer(text) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\s*\+\s(.+)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)/gm, "<p>$1</p>");

  document.getElementById("coach-answer-text").innerHTML = html;
  document.getElementById("coach-answer-container").style.display = "block";
  document.getElementById("coach-modal-overlay").classList.add("open");
}

export function closeCoachModal() {
  document.getElementById("coach-modal-overlay").classList.remove("open");
}

export async function fetchCoachAnswer() {
  const btn = document.getElementById("btn-coach-answer");
  btn.disabled    = true;
  btn.textContent = "Generating…";

  try {
    const res  = await fetch("/coach-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.error) { showToast(data.error); return; }
    renderCoachAnswer(data.coach_answer);
  } catch {
    showToast("Failed to generate answer.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Get Coach Answer";
  }
}

/* ── Evaluation overlay ──────────────────────────────────────────────────── */

export function renderEvaluation(evalData) {
  const content = document.getElementById("eval-content");

  const dimAvgs = evalData.dimension_averages || {};
  const dimHtml = Object.entries(dimAvgs).map(([k, v]) => `
    <div class="dim-row">
      <span class="dim-label">${k}</span>
      <div class="dim-bar">
        <div class="dim-fill ${v >= 7 ? "good" : v >= 5 ? "ok" : "low"}" style="width:${v * 10}%"></div>
      </div>
      <span class="dim-val">${typeof v === "number" ? v.toFixed(1) : v}</span>
    </div>
  `).join("");

  const listHtml = (arr) => (arr || []).map(s => `<li>${escapeHtml(s)}</li>`).join("");
  const planHtml = (evalData.improvement_plan || []).map(item => `
    <div class="plan-item priority-${item.priority || "medium"}">
      <div class="plan-area">${escapeHtml(item.area || "")}</div>
      <div class="plan-action">${escapeHtml(item.action || "")}</div>
      <div class="plan-resources">${escapeHtml(item.resources || "")}</div>
    </div>
  `).join("");

  content.innerHTML = `
    <div class="eval-grade">
      <span class="eval-grade-letter">${escapeHtml(evalData.overall_grade || "N/A")}</span>
      <span class="eval-grade-score">${(evalData.overall_score || 0).toFixed(1)}/10</span>
    </div>
    <div class="eval-section">
      <h3>Dimension Breakdown</h3>
      <div class="eval-dimensions">${dimHtml}</div>
    </div>
    <div class="eval-columns">
      <div class="eval-section">
        <h3>Strengths</h3>
        <ul class="eval-list strengths">${listHtml(evalData.strengths) || "<li>—</li>"}</ul>
      </div>
      <div class="eval-section">
        <h3>Weaknesses</h3>
        <ul class="eval-list weaknesses">${listHtml(evalData.weaknesses) || "<li>—</li>"}</ul>
      </div>
    </div>
    ${listHtml(evalData.patterns) ? `<div class="eval-section"><h3>Patterns Observed</h3><ul class="eval-list patterns">${listHtml(evalData.patterns)}</ul></div>` : ""}
    <div class="eval-section">
      <h3>Improvement Plan</h3>
      <div class="eval-plan">${planHtml || "<p>No specific recommendations.</p>"}</div>
    </div>
    <div class="eval-section">
      <h3>Summary</h3>
      <p class="eval-summary">${escapeHtml(evalData.summary || "")}</p>
    </div>
  `;
}

export function closeEvaluation() {
  document.getElementById("eval-overlay").style.display = "none";
}

/* ── Stubs for removed panel modal (no longer used) ─────────────────────── */
export function renderScore()           {}
export function renderReferenceAnswer() {}
export function openPanelModal()        {}
export function closePanelModal()       {}
