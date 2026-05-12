/**
 * session.js
 * ───────────
 * Orchestrates interview session lifecycle.
 * Uses the new round-card system from chat.js.
 */

import { apiStart, apiAnswer, apiSkip, apiReset, apiEnd, apiSessionStatus } from "./api.js";
import { showQuestion, showTyping, hideTyping, sealRound, clearChat, toggleRoundCard, switchRoundTab } from "./chat.js";
import { updateAdaptiveIndicator, renderEvaluation, renderCoachAnswer, closeCoachModal, fetchCoachAnswer } from "./panels.js";
import { setStatus, showToast, setAnswerFormLocked, escapeHtml } from "./ui.js";
import { state, setInterviewActive, setActiveProvider, setAdaptiveState, pushScore, resetState } from "./state.js";
import { speakText, stopSpeaking } from "./speech.js";

// Natural conversational fillers
const fillers = [
  "So,",
  "Alright,",
  "Okay,",
  "Good.",
  "Let's see.",
  "Hmm,",
  "Interesting.",
  "Well,"
];

// Speaks question with filler but displays clean text
function speakQuestionNaturally(msg) {
  const filler = fillers[Math.floor(Math.random() * fillers.length)];

  // Final spoken sentence
  const spokenText = `${filler} ${msg}`;

  speakText(spokenText, (revealedText) => {
    // Remove filler from visible UI text
    let display = revealedText;

    if (revealedText.startsWith(filler)) {
      display = revealedText.slice(filler.length).trim();
    }

    document.getElementById("aq-text").textContent = display;
  });
}

// Holds the current pending round data while waiting for backend response
let _pendingRound = { question: "", answer: "" };

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

    document.getElementById("setup-panel").style.display  = "none";
    document.getElementById("chip-topic").textContent     = topic;
    document.getElementById("chip-level").textContent     = difficulty;
    document.getElementById("interview-panel").classList.add("active");
    document.getElementById("btn-download").style.display = "inline-flex";
    document.getElementById("btn-coach-answer").style.display = "inline-flex";
    setInterviewActive(true);
    setStatus("Live Interview", true);

    const msg = data.recruiter_message || data.recruiter_message_local || "";
    _pendingRound.question = msg;
    showQuestion(msg);
    speakQuestionNaturally(msg);
  } catch {
    showToast("Connection failed. Check your API key.");
    btnStart.disabled    = false;
    btnStart.textContent = "Start Interview →";
    setStatus("Error");
  }
}

/* ── Submit answer ───────────────────────────────────────────────────────── */

export async function submitAnswer() {
  stopSpeaking();
  const input  = document.getElementById("answer-input");
  const answer = input.value.trim();
  if (!answer) { showToast("Please write an answer first."); return; }

  const question = _pendingRound.question;

  setAnswerFormLocked(true);
  input.value = "";
  document.getElementById("char-count").textContent = "0 chars";
  showTyping();

  try {
    const data = await apiAnswer(answer);
    hideTyping();
    if (data.error) { showToast(data.error); return; }

    if (data.adaptive) {
      setAdaptiveState(data.adaptive);
      updateAdaptiveIndicator(data.adaptive);
    }
    if (data.score) pushScore(data.score);

    // Seal the completed round as a collapsible card
    sealRound({
      question,
      answer,
      score:     data.score     || null,
      refData:   data.reference_answer || null,
      coachText: data.coach_feedback   || null,
    });

    // Set up next question
    const nextQ = data.recruiter_message || data.recruiter_message_local || "";
    _pendingRound.question = nextQ;
    showQuestion(nextQ);
    speakQuestionNaturally(nextQ);
    // Reset coach answer modal for new round
    document.getElementById("coach-answer-container").style.display = "none";
    const coachBtn = document.getElementById("btn-coach-answer");
    if (coachBtn) {
      coachBtn.disabled    = false;
      coachBtn.textContent = "Get Coach Answer";
    }
  } catch {
    hideTyping();
    showToast("Something went wrong. Try again.");
  } finally {
    setAnswerFormLocked(false);
    input.focus();
  }
}

/* ── Skip ────────────────────────────────────────────────────────────────── */

export async function skipQuestion() {
  stopSpeaking();
  const question = _pendingRound.question;

  setAnswerFormLocked(true);
  document.getElementById("btn-skip").disabled = true;
  showTyping();

  try {
    const data = await apiSkip();
    hideTyping();
    if (data.error) { showToast(data.error); return; }

    // Seal as skipped (no score/ref/coach)
    sealRound({ question, answer: "", skipped: true });

    const nextQ = data.recruiter_message || data.recruiter_message_local || "";
    _pendingRound.question = nextQ;
    showQuestion(nextQ);
    speakQuestionNaturally(nextQ);

    document.getElementById("coach-answer-container").style.display = "none";
    const coachBtn = document.getElementById("btn-coach-answer");
    if (coachBtn) {
      coachBtn.disabled    = false;
      coachBtn.textContent = "Get Coach Answer";
    }
  } catch {
    hideTyping();
    showToast("Failed to skip. Try again.");
  } finally {
    setAnswerFormLocked(false);
    document.getElementById("btn-skip").disabled = false;
    document.getElementById("answer-input").focus();
  }
}

/* ── Reset ───────────────────────────────────────────────────────────────── */

export function resetInterview() {
  stopSpeaking();
  if (!confirm("End this session and start over?")) return;

  apiReset().finally(() => {
    resetState();
    _pendingRound = { question: "", answer: "" };

    document.getElementById("interview-panel").classList.remove("active");
    document.getElementById("chip-adaptive").style.display = "none";
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
  if (state.roundCount < 1 && state.scores.length < 1) {
    showToast("Need at least 1 answered round for evaluation.");
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

// AFTER
export async function checkForExistingSession() {
  try {
    const data = await apiSessionStatus();
    if (!data.active) return;
    // Always auto-resume — refresh should never lose the session
    resumeSession(data);
  } catch {
    // Silently fail — show setup panel as normal
  }
}

function resumeSession(data) {
  document.getElementById("setup-panel").style.display  = "none";
  document.getElementById("chip-topic").textContent     = data.topic;
  document.getElementById("chip-level").textContent     = data.difficulty;
  document.getElementById("interview-panel").classList.add("active");

  setInterviewActive(true);
  state.roundCount = data.round || 0;
  state.scores     = data.scores || [];
  setStatus("Live Interview", true);

  // Replay history as sealed cards (best effort — no score/ref data available)
  const history = data.history || [];
  for (let i = 0; i < history.length - 1; i += 2) {
    const q = history[i]?.role === "assistant" ? history[i].content : "";
    const a = history[i + 1]?.role === "user"  ? history[i + 1].content : "";
    if (q) sealRound({ question: q, answer: a, score: null, refData: null, coachText: null });
  }

  // Last message is unanswered question
  const last = history[history.length - 1];
  if (last?.role === "assistant") {
    _pendingRound.question = last.content;
    showQuestion(last.content);
  }

  if (data.adaptive_state) {
    setAdaptiveState(data.adaptive_state);
    const hist = data.adaptive_state.action_history || [];
    if (hist.length > 0) {
      updateAdaptiveIndicator({ action: hist[hist.length - 1].split(":")[0], reasoning: "" });
    }
  }
}

export function downloadTranscript() {
  window.location.href = "/download-pdf";
}

// Warn before tab close / navigation away during an active session
window.addEventListener("beforeunload", (e) => {
  if (state.interviewActive) {
    e.preventDefault();
    e.returnValue = ""; // Required for Chrome — shows browser's default dialog
  }
});
