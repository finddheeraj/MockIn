/**
 * panels.js
 * ──────────
 * Functions that render data into the right-hand panels:
 *   - Score panel
 *   - Reference answer panel
 *   - Adaptive difficulty chip
 *   - Coach answer
 *   - Evaluation overlay
 * Depends on: ui.js (escapeHtml, showToast), state.js (roundCount)
 */

import { escapeHtml, showToast } from "./ui.js";
import { state } from "./state.js";

/* ── Score ───────────────────────────────────────────────────────────────── */

export function renderScore(scoreData) {
  const panel = document.getElementById("score-panel");
  panel.style.display = "block";

  document.getElementById("score-round-label").textContent =
    `Round ${scoreData.round || state.roundCount}`;

  const overall   = scoreData.overall || 0;
  const overallEl = document.getElementById("score-overall");
  overallEl.innerHTML =
    `<span class="score-number">${overall.toFixed(1)}</span><span class="score-max">/10</span>`;
  overallEl.className =
    "score-overall " + (overall >= 7 ? "good" : overall >= 5 ? "ok" : "low");

  const dims   = scoreData.dimensions || {};
  const dimsEl = document.getElementById("score-dimensions");
  dimsEl.innerHTML = Object.entries(dims).map(([key, val]) => `
    <div class="dim-row">
      <span class="dim-label">${key}</span>
      <div class="dim-bar">
        <div class="dim-fill ${val >= 7 ? "good" : val >= 5 ? "ok" : "low"}" style="width:${val * 10}%"></div>
      </div>
      <span class="dim-val">${val}</span>
    </div>
  `).join("");

  document.getElementById("score-rationale").textContent =
    scoreData.brief_rationale || "";
}

/* ── Reference answer ────────────────────────────────────────────────────── */

export function renderReferenceAnswer(refData) {
  const panel   = document.getElementById("reference-panel");
  const content = document.getElementById("reference-content");

  if (!refData || (!refData.key_concepts && !refData.ideal_answer_points)) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  let html = "";

  if (refData.key_concepts?.length) {
    html += `<div class="ref-section"><div class="ref-label">Key Concepts</div><ul class="ref-list">`;
    refData.key_concepts.forEach(c => { html += `<li>${escapeHtml(c)}</li>`; });
    html += `</ul></div>`;
  }

  if (refData.ideal_answer_points?.length) {
    html += `<div class="ref-section"><div class="ref-label">Ideal Answer Points</div><ul class="ref-list">`;
    refData.ideal_answer_points.forEach(p => { html += `<li>${escapeHtml(p)}</li>`; });
    html += `</ul></div>`;
  }

  if (refData.common_mistakes?.length) {
    html += `<div class="ref-section"><div class="ref-label">Common Mistakes</div><ul class="ref-list mistakes">`;
    refData.common_mistakes.forEach(m => { html += `<li>${escapeHtml(m)}</li>`; });
    html += `</ul></div>`;
  }

  content.innerHTML = html;
}

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
  chip.textContent  = ACTION_LABELS[adaptiveData.action] || adaptiveData.action;
  chip.style.display = "inline-block";
  chip.title        = adaptiveData.reasoning || "";
}

/* ── Coach answer ────────────────────────────────────────────────────────── */

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
  const overlay = document.getElementById("coach-modal-overlay");
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
}

export function closeCoachModal() {
  document.getElementById("coach-modal-overlay").style.display = "none";
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

  const patternsHtml = listHtml(evalData.patterns);

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

    ${patternsHtml ? `<div class="eval-section"><h3>Patterns Observed</h3><ul class="eval-list patterns">${patternsHtml}</ul></div>` : ""}

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
