/**
 * chat.js
 * ────────
 * All functions that build and mutate the chat area and coach panel.
 * Depends on: ui.js (escapeHtml), state.js (roundCount / incrementRound)
 */

import { escapeHtml } from "./ui.js";
import { state, incrementRound } from "./state.js";

/**
 * Append a message bubble to the chat area.
 * @param {"recruiter"|"candidate"} role
 * @param {string} text
 * @param {string} [modelTag] — optional model label (e.g. "Grok", "Llama-3.1-8B")
 */
export function addMessage(role, text, modelTag) {
  const chatArea = document.getElementById("chat-area");
  const empty    = document.getElementById("chat-empty");
  if (empty) empty.remove();

  const isRecruiter = role === "recruiter";
  const tagHtml = modelTag
    ? `<span class="model-tag ${modelTag.toLowerCase().includes("llama") ? "local" : "grok"}">${escapeHtml(modelTag)}</span>`
    : "";

  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML = `
    <div class="msg-avatar ${isRecruiter ? "recruiter" : "candidate"}">
      ${isRecruiter ? "I" : "U"}
    </div>
    <div class="msg-body">
      <div class="msg-label ${isRecruiter ? "recruiter" : "candidate"}">
        ${isRecruiter ? "Interviewer" : "You"} ${tagHtml}
      </div>
      <div class="msg-text">${escapeHtml(text)}</div>
    </div>
  `;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

/** Show animated dots while waiting for the recruiter's reply. */
export function addTypingIndicator() {
  const chatArea = document.getElementById("chat-area");
  const div      = document.createElement("div");
  div.className  = "message";
  div.id         = "typing";
  div.innerHTML  = `
    <div class="msg-avatar recruiter">I</div>
    <div class="msg-body">
      <div class="msg-label recruiter">Interviewer</div>
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

export function removeTypingIndicator() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

/**
 * Prepend a new coach feedback card to the coach panel.
 * @param {string} text
 * @param {string} [modelTag]
 * @param {boolean} [skipRoundIncrement] — true when adding a second model's feedback for the same round
 */
export function addCoachFeedback(text, modelTag, skipRoundIncrement) {
  if (!skipRoundIncrement) incrementRound();

  const empty = document.getElementById("coach-empty");
  if (empty) empty.style.display = "none";

  const entries = document.getElementById("coach-entries");
  entries.style.display = "flex";

  const tagHtml = modelTag
    ? `<span class="model-tag ${modelTag.toLowerCase().includes("llama") ? "local" : "grok"}">${escapeHtml(modelTag)}</span>`
    : "";

  const div     = document.createElement("div");
  div.className = "coach-entry";
  div.innerHTML = `
    <div class="coach-entry-round">Round ${state.roundCount} ${tagHtml}</div>
    <div class="coach-entry-text">${escapeHtml(text)}</div>
  `;
  entries.insertBefore(div, entries.firstChild);
}

/** Reset the chat area back to its empty-state placeholder. */
export function clearChat() {
  document.getElementById("chat-area").innerHTML = `
    <div class="chat-empty" id="chat-empty">
      <div class="chat-empty-icon">Q</div>
      <span>Interview starting…</span>
    </div>
  `;
  document.getElementById("coach-entries").innerHTML   = "";
  document.getElementById("coach-entries").style.display = "none";
  document.getElementById("coach-empty").style.display   = "flex";
  document.getElementById("coach-answer-container").style.display = "none";
  document.getElementById("btn-coach-answer").style.display = "inline-flex";
}
