/**
 * chat.js
 * ────────
 * Manages the round-card UI.
 *
 * Flow per round:
 *   1. showQuestion(text)      — displays the active question card
 *   2. submitAnswer is called  — user answer captured in session.js
 *   3. sealRound(q, a, score, refData, coachText) — collapses into a round card
 *
 * Each sealed round card has 3 tabs: Performance | Reference | Coach
 */

import { escapeHtml } from "./ui.js";
import { state, incrementRound } from "./state.js";

/* ── Active question (unanswered) ────────────────────────────────────────── */

/** Show a new question in the active question card above the textarea. */
export function showQuestion(text) {
  const card = document.getElementById("active-question-card");
  const el   = document.getElementById("aq-text");
  const empty = document.getElementById("chat-empty");

  if (empty) empty.remove();

  el.textContent     = text;
  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Show typing dots in the active question card while waiting. */
export function showTyping() {
  const card   = document.getElementById("active-question-card");
  const typing = document.getElementById("aq-typing");
  const el     = document.getElementById("aq-text");
  const empty  = document.getElementById("chat-empty");

  if (empty) empty.remove();

  el.textContent     = "";
  typing.style.display = "flex";
  card.style.display = "block";
}

export function hideTyping() {
  document.getElementById("aq-typing").style.display = "none";
}

/* ── Seal a completed round into a collapsible card ─────────────────────── */

/**
 * @param {object} opts
 * @param {string}  opts.question
 * @param {string}  opts.answer
 * @param {object|null} opts.score      — scoreData from backend
 * @param {object|null} opts.refData    — reference_answer from backend
 * @param {string|null} opts.coachText  — coach_feedback from backend
 * @param {boolean} opts.skipped
 */
export function sealRound({ question, answer, score, refData, coachText, skipped = false }) {
  incrementRound();

  // Hide the active question card — next question will repopulate it
  const activeCard = document.getElementById("active-question-card");
  activeCard.style.display = "none";
  document.getElementById("aq-text").textContent = "";

  const roundNum = state.roundCount;
  const area     = document.getElementById("rounds-area");

  // ── Score tab content ──────────────────────────────────────────────────
  let scoreHtml = "";
  let scoreBadgeHtml = "";
  if (score && !skipped) {
    const overall = score.overall || 0;
    const cls     = overall >= 7 ? "good" : overall >= 5 ? "ok" : "low";
    const dims    = score.dimensions || {};

    scoreBadgeHtml = `<span class="round-score-badge ${cls}">${overall.toFixed(1)}</span>`;

    const dimRows = Object.entries(dims).map(([key, val]) => `
      <div class="dim-row">
        <span class="dim-label">${escapeHtml(key)}</span>
        <div class="dim-bar">
          <div class="dim-fill ${val >= 7 ? "good" : val >= 5 ? "ok" : "low"}" style="width:${val * 10}%"></div>
        </div>
        <span class="dim-val">${val}</span>
      </div>
    `).join("");

    scoreHtml = `
      <div class="score-overall ${cls}">
        <span class="score-number">${overall.toFixed(1)}</span><span class="score-max">/10</span>
      </div>
      <div class="score-dimensions">${dimRows}</div>
      ${score.brief_rationale ? `<div class="score-rationale">${escapeHtml(score.brief_rationale)}</div>` : ""}
    `;
  } else {
    scoreHtml = `<p style="color:var(--text-dim);font-size:13px;">${skipped ? "Question was skipped." : "No score available."}</p>`;
  }

  // ── Reference tab content ──────────────────────────────────────────────
  let refHtml = "";
  if (refData && (refData.key_concepts?.length || refData.ideal_answer_points?.length || refData.common_mistakes?.length)) {
    if (refData.key_concepts?.length) {
      refHtml += `<div class="ref-label">Key Concepts</div><ul class="ref-list">`;
      refData.key_concepts.forEach(c => { refHtml += `<li>${escapeHtml(c)}</li>`; });
      refHtml += `</ul>`;
    }
    if (refData.ideal_answer_points?.length) {
      refHtml += `<div class="ref-label">Ideal Answer Points</div><ul class="ref-list">`;
      refData.ideal_answer_points.forEach(p => { refHtml += `<li>${escapeHtml(p)}</li>`; });
      refHtml += `</ul>`;
    }
    if (refData.common_mistakes?.length) {
      refHtml += `<div class="ref-label">Common Mistakes</div><ul class="ref-list mistakes">`;
      refData.common_mistakes.forEach(m => { refHtml += `<li>${escapeHtml(m)}</li>`; });
      refHtml += `</ul>`;
    }
  } else {
    refHtml = `<p style="color:var(--text-dim);font-size:13px;">No reference data for this question.</p>`;
  }

  // ── Coach tab content ──────────────────────────────────────────────────
  const coachHtml = coachText
    ? `<div class="coach-entry"><div class="coach-entry-text">${escapeHtml(coachText)}</div></div>`
    : `<p style="color:var(--text-dim);font-size:13px;">No coach feedback for this round.</p>`;

  // ── Preview (truncated question) ───────────────────────────────────────
  const preview = question.length > 80 ? question.slice(0, 80) + "…" : question;
  const badgeCls = skipped ? "skipped" : "";

  // ── Build card ─────────────────────────────────────────────────────────
  const card = document.createElement("div");
  card.className = "round-card";
  card.id        = `round-card-${roundNum}`;

  card.innerHTML = `
    <div class="round-card-header" onclick="toggleRoundCard(${roundNum})">
      <span class="round-badge ${badgeCls}">Q${roundNum}${skipped ? " · Skipped" : ""}</span>
      <span class="round-question-preview">${escapeHtml(preview)}</span>
      ${scoreBadgeHtml}
      <svg class="round-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>
    <div class="round-card-body">
      <div class="round-qa">
        <div class="round-section-label">Question</div>
        <div class="round-q-text">${escapeHtml(question)}</div>
        <div class="round-section-label">Your Answer</div>
        <div class="round-a-text">${escapeHtml(answer || "(skipped)")}</div>
      </div>
      <div class="round-tabs">
        <button class="round-tab active" onclick="switchRoundTab(${roundNum}, 'performance', this)">📊 Performance</button>
        <button class="round-tab"        onclick="switchRoundTab(${roundNum}, 'reference', this)">📖 Reference</button>
        <button class="round-tab"        onclick="switchRoundTab(${roundNum}, 'coach', this)">🎯 Coach</button>
      </div>
      <div class="round-tab-panels">
        <div class="round-tab-panel active" id="tab-performance-${roundNum}">${scoreHtml}</div>
        <div class="round-tab-panel"        id="tab-reference-${roundNum}">${refHtml}</div>
        <div class="round-tab-panel"        id="tab-coach-${roundNum}">${coachHtml}</div>
      </div>
    </div>
  `;

  area.appendChild(card);
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ── Toggle / tab helpers (called from inline onclick) ───────────────────── */

export function toggleRoundCard(num) {
  document.getElementById(`round-card-${num}`).classList.toggle("open");
}

export function switchRoundTab(num, tab, btn) {
  const card = document.getElementById(`round-card-${num}`);

  // Deactivate all tabs & panels in this card
  card.querySelectorAll(".round-tab").forEach(t => t.classList.remove("active"));
  card.querySelectorAll(".round-tab-panel").forEach(p => p.classList.remove("active"));

  // Activate clicked
  btn.classList.add("active");
  card.querySelector(`#tab-${tab}-${num}`).classList.add("active");
}

/* ── Clear all rounds (on reset) ─────────────────────────────────────────── */

export function clearChat() {
  const area = document.getElementById("rounds-area");
  area.innerHTML = `
    <div class="chat-empty" id="chat-empty">
      <div class="chat-empty-icon">Q</div>
      <span>Interview starting…</span>
    </div>
  `;
  const activeCard = document.getElementById("active-question-card");
  activeCard.style.display = "none";
  document.getElementById("aq-text").textContent = "";

  document.getElementById("coach-answer-container").style.display = "none";
}

/* ── Legacy stubs kept so session.js doesn't break ───────────────────────── */
export function addMessage()          {}
export function addTypingIndicator()  { showTyping(); }
export function removeTypingIndicator() { hideTyping(); }
export function addCoachFeedback()    {}
