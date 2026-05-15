/**
 * conversational.js
 * ──────────────────
 * DOM helpers for all new conversational UI elements.
 * Each bubble is injected into #rounds-area and auto-removes itself
 * when the next round seals, or after a timeout.
 *
 * Exported functions:
 *   showReactionBubble(text)       — brief interviewer reaction after candidate submits
 *   showInterruptBubble(text)      — mid-answer interrupt from recruiter
 *   removeInterruptBubble()        — clears any active interrupt bubble
 *   showNudgeBubble(text)          — silence nudge after 20s inactivity
 *   removeNudgeBubble()            — clears any active nudge bubble
 *   showClarificationBubble(text)  — clarification request (replaces next-question card visually)
 */

import { escapeHtml } from "./ui.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function _getRoundsArea() {
  return document.getElementById("rounds-area");
}

function _removeById(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Reaction bubble ───────────────────────────────────────────────────────────
// Shown briefly after candidate submits, before the next question appears.
// Auto-removes after 3.5 seconds.

export function showReactionBubble(text) {
  _removeById("reaction-bubble");

  const bubble = document.createElement("div");
  bubble.id        = "reaction-bubble";
  bubble.className = "conv-bubble conv-bubble--reaction";
  bubble.innerHTML = `
    <span class="conv-bubble__avatar">🎙</span>
    <span class="conv-bubble__text">${escapeHtml(text)}</span>
  `;

  _getRoundsArea().appendChild(bubble);

  // Fade out naturally after 3.5s
  setTimeout(() => {
    bubble.classList.add("conv-bubble--fade");
    setTimeout(() => bubble.remove(), 500);
  }, 3500);
}

// ── Interrupt bubble ──────────────────────────────────────────────────────────
// Injected mid-typing. Has a "noted, continue" dismiss button.

export function showInterruptBubble(text) {
  _removeById("interrupt-bubble");

  const bubble = document.createElement("div");
  bubble.id        = "interrupt-bubble";
  bubble.className = "conv-bubble conv-bubble--interrupt";
  bubble.innerHTML = `
    <div class="conv-bubble__header">
      <span class="conv-bubble__avatar">⚡</span>
      <span class="conv-bubble__label">Interviewer jumped in</span>
      <button class="conv-bubble__dismiss" onclick="document.getElementById('interrupt-bubble')?.remove()">
        Got it, continue ✕
      </button>
    </div>
    <span class="conv-bubble__text">${escapeHtml(text)}</span>
  `;

  // Insert before the active question card so it appears in the flow
  const aqCard = document.getElementById("active-question-card");
  if (aqCard) {
    _getRoundsArea().insertBefore(bubble, aqCard);
  } else {
    _getRoundsArea().appendChild(bubble);
  }
}

export function removeInterruptBubble() {
  _removeById("interrupt-bubble");
}

// ── Nudge bubble ──────────────────────────────────────────────────────────────
// Appears below the textarea after 20s of silence. Dismisses on any keypress.

export function showNudgeBubble(text) {
  _removeById("nudge-bubble");

  const bubble = document.createElement("div");
  bubble.id        = "nudge-bubble";
  bubble.className = "conv-bubble conv-bubble--nudge";
  bubble.innerHTML = `
    <span class="conv-bubble__avatar">💬</span>
    <span class="conv-bubble__text">${escapeHtml(text)}</span>
  `;

  // Place the nudge bubble just before the active question card
  const aqCard = document.getElementById("active-question-card");
  if (aqCard) {
    _getRoundsArea().insertBefore(bubble, aqCard);
  } else {
    _getRoundsArea().appendChild(bubble);
  }

  // Auto-dismiss after 10s
  setTimeout(() => removeNudgeBubble(), 10_000);
}

export function removeNudgeBubble() {
  _removeById("nudge-bubble");
}

// ── Clarification bubble ──────────────────────────────────────────────────────
// Replaces the active question card visually when clarification is pending.
// Looks lighter than a full round card — signals "same topic, just dig deeper".

export function showClarificationBubble(text) {
  _removeById("clarification-bubble");

  // Update the active question card directly so the candidate sees the clarification
  // as the current "question" they need to answer
  const aqLabel = document.querySelector(".aq-label");
  const aqText  = document.getElementById("aq-text");

  if (aqLabel) aqLabel.textContent = "CLARIFICATION NEEDED";
  if (aqText)  aqText.textContent  = text;

  // Also inject a small badge above the textarea to signal the mode
  _removeById("clarification-badge");
  const badge = document.createElement("div");
  badge.id        = "clarification-badge";
  badge.className = "conv-bubble conv-bubble--clarification";
  badge.innerHTML = `
    <span class="conv-bubble__avatar">🔍</span>
    <span class="conv-bubble__text">
      Your answer was brief. The interviewer wants you to expand — answer the clarification above.
    </span>
  `;

  const answerArea = document.querySelector(".answer-area");
  if (answerArea) {
    answerArea.parentNode.insertBefore(badge, answerArea);
  }
}
