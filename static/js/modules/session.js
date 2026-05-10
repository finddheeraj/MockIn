/**
 * session.js
 * ───────────
 * Orchestrates interview session lifecycle:
 *   startInterview, submitAnswer, skipQuestion, resetInterview,
 *   endAndEvaluate, checkForExistingSession, resumeSession
 *
 * This is the "controller" layer — it calls api.js then delegates
 * rendering to chat.js and panels.js and status changes to ui.js.
 */

import { apiStart, apiAnswer, apiSkip, apiReset, apiEnd, apiSessionStatus } from "./api.js";
import { addMessage, addTypingIndicator, removeTypingIndicator, clearChat } from "./chat.js";
import { renderScore, renderReferenceAnswer, updateAdaptiveIndicator, renderEvaluation } from "./panels.js";
import {
  setStatus, showToast, setAnswerFormLocked, escapeHtml,
} from "./ui.js";
import {
  state, setInterviewActive, setActiveProvider, setAdaptiveState,
  pushScore, resetState,
} from "./state.js";

/* ── Start ───────────────────────────────────────────────────────────────── */

export async function startInterview() {
  const topic      = document.getElementById("topic-select").value;
  const difficulty = document.getElementById("difficulty-select").value;

  const btnStart       = document.getElementById("btn-start");
  btnStart.disabled    = true;
  btnStart.textContent = "Connecting…";
  setStatus("Connecting…");

  try {
    const data = await apiStart(topic, difficulty);

    if (data.error) { showToast(data.error); return; }

    setActiveProvider(data.provider || "grok");

    document.getElementById("setup-panel").style.display    = "none";
    document.getElementById("chip-topic").textContent       = topic;
    document.getElementById("chip-level").textContent       = difficulty;
    document.getElementById("interview-panel").classList.add("active");
    document.getElementById("btn-download").style.display   = "inline-flex";
    setInterviewActive(true);
    setStatus("Live Interview", true);

    if (state.activeProvider === "both") {
      if (data.recruiter_message)       addMessage("recruiter", data.recruiter_message, "Grok");
      if (data.recruiter_message_local) addMessage("recruiter", data.recruiter_message_local, "Llama-3.1-8B");
    } else {
      addMessage("recruiter", data.recruiter_message);
    }
  } catch {
    showToast("Connection failed. Check your API key.");
    btnStart.disabled    = false;
    btnStart.textContent = "Start Interview →";
    setStatus("Error");
  }
}

/* ── Submit answer ───────────────────────────────────────────────────────── */

export async function submitAnswer() {
  const input  = document.getElementById("answer-input");
  const answer = input.value.trim();

  if (!answer) { showToast("Please write an answer first."); return; }

  setAnswerFormLocked(true);
  addMessage("candidate", answer);
  input.value = "";
  document.getElementById("char-count").textContent = "0 chars";
  addTypingIndicator();

  try {
    const data = await apiAnswer(answer);
    removeTypingIndicator();

    if (data.error) { showToast(data.error); return; }

    // Reset coach answer slot for new round
    document.getElementById("coach-answer-container").style.display = "none";
    document.getElementById("btn-coach-answer").style.display = "inline-flex";

    if (data.score) {
      pushScore(data.score);
      renderScore(data.score);
    }
    if (data.adaptive) {
      setAdaptiveState(data.adaptive);
      updateAdaptiveIndicator(data.adaptive);
    }
    if (data.reference_answer) {
      renderReferenceAnswer(data.reference_answer);
    }

    if (data.provider === "both") {
      if (data.recruiter_message)       addMessage("recruiter", data.recruiter_message, "Grok");
      if (data.recruiter_message_local) addMessage("recruiter", data.recruiter_message_local, "Llama-3.1-8B");
      if (data.coach_feedback)          addCoachFeedback(data.coach_feedback, "Grok");
      if (data.coach_feedback_local)    addCoachFeedback(data.coach_feedback_local, "Llama-3.1-8B", true);
    } else {
      addMessage("recruiter", data.recruiter_message);
      if (data.coach_feedback) addCoachFeedback(data.coach_feedback);
    }
  } catch {
    removeTypingIndicator();
    showToast("Something went wrong. Try again.");
  } finally {
    setAnswerFormLocked(false);
    input.focus();
  }
}

// Lazy import to avoid circular dependency with chat.js
async function addCoachFeedback(...args) {
  const { addCoachFeedback: _add } = await import("./chat.js");
  _add(...args);
}

/* ── Skip ────────────────────────────────────────────────────────────────── */

export async function skipQuestion() {
  setAnswerFormLocked(true);
  document.getElementById("btn-skip").disabled = true;
  addMessage("candidate", "[Skipped]");
  addTypingIndicator();

  try {
    const data = await apiSkip();
    removeTypingIndicator();

    if (data.error) { showToast(data.error); return; }

    document.getElementById("coach-answer-container").style.display = "none";
    document.getElementById("btn-coach-answer").style.display = "inline-flex";

    if (data.provider === "both") {
      if (data.recruiter_message)       addMessage("recruiter", data.recruiter_message, "Grok");
      if (data.recruiter_message_local) addMessage("recruiter", data.recruiter_message_local, "Llama-3.1-8B");
    } else {
      addMessage("recruiter", data.recruiter_message);
    }
  } catch {
    removeTypingIndicator();
    showToast("Failed to skip. Try again.");
  } finally {
    setAnswerFormLocked(false);
    document.getElementById("btn-skip").disabled = false;
    document.getElementById("answer-input").focus();
  }
}

/* ── Reset ───────────────────────────────────────────────────────────────── */

export function resetInterview() {
  if (!confirm("End this session and start over?")) return;

  apiReset().finally(() => {
    resetState();

    document.getElementById("interview-panel").classList.remove("active");
    document.getElementById("score-panel").style.display     = "none";
    document.getElementById("reference-panel").style.display = "none";
    document.getElementById("chip-adaptive").style.display   = "none";
    clearChat();

    document.getElementById("setup-panel").style.display = "flex";

    const btnStart       = document.getElementById("btn-start");
    btnStart.disabled    = false;
    btnStart.textContent = "Start Interview →";

    setStatus("Ready");
  });
}

/* ── End & Evaluate ──────────────────────────────────────────────────────── */

export async function endAndEvaluate() {
  if (state.roundCount < 2) {
    showToast("Need at least 2 rounds for evaluation.");
    return;
  }

  const overlay = document.getElementById("eval-overlay");
  const content = document.getElementById("eval-content");
  overlay.style.display = "flex";
  content.innerHTML = '<div class="eval-loading">Generating evaluation…</div>';

  try {
    const data = await apiEnd();
    if (data.error) {
      content.innerHTML = `<div class="eval-error">${escapeHtml(data.error)}</div>`;
      return;
    }
    renderEvaluation(data.evaluation);
  } catch {
    content.innerHTML = '<div class="eval-error">Failed to generate evaluation.</div>';
  }
}

/* ── Session resumption ──────────────────────────────────────────────────── */

export async function checkForExistingSession() {
  try {
    const data = await apiSessionStatus();
    if (!data.active) return;

    const resume = confirm(
      `You have an active interview in progress:\n\n` +
      `Topic: ${data.topic}\n` +
      `Difficulty: ${data.difficulty}\n` +
      `Round: ${data.round}\n\n` +
      `Would you like to resume? (Cancel to start fresh)`
    );

    if (resume) {
      resumeSession(data);
    } else {
      await apiReset();
    }
  } catch {
    // Silently fail — show setup panel as normal
  }
}

function resumeSession(data) {
  document.getElementById("setup-panel").style.display    = "none";
  document.getElementById("chip-topic").textContent       = data.topic;
  document.getElementById("chip-level").textContent       = data.difficulty;
  document.getElementById("interview-panel").classList.add("active");

  setInterviewActive(true);
  state.roundCount = data.round || 0;
  state.scores     = data.scores || [];
  setStatus("Live Interview", true);

  for (const msg of (data.history || [])) {
    if (msg.role === "assistant") addMessage("recruiter", msg.content);
    else if (msg.role === "user") addMessage("candidate", msg.content);
  }

  if (state.scores.length > 0) {
    renderScore(state.scores[state.scores.length - 1]);
  }

  if (data.adaptive_state) {
    setAdaptiveState(data.adaptive_state);
    const history = data.adaptive_state.action_history || [];
    if (history.length > 0) {
      const actionKey = history[history.length - 1].split(":")[0];
      updateAdaptiveIndicator({ action: actionKey, reasoning: "" });
    }
  }
}

export function downloadTranscript() {
  window.location.href = "/download-pdf";
}
