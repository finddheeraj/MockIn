/**
 * session.js
 * ───────────
 * Orchestrates interview session lifecycle.
 *
 * Conversational modes wired here:
 *   - Silence nudge      : fires after 20s of inactivity in the textarea
 *   - Mid-answer interrupt: fires after 60+ words typed (30% probability via backend)
 *   - Clarification      : auto-triggered for very short answers (< 25 words)
 *   - Reaction bubble    : shown before the follow-up question on every round
 */

import { apiStart, apiAnswer, apiClarify, apiInterrupt, apiNudge, apiSkip, apiReset, apiEnd, apiSessionStatus } from "./api.js";
import { showQuestion, showTyping, hideTyping, sealRound, clearChat, toggleRoundCard, switchRoundTab } from "./chat.js";
import { updateAdaptiveIndicator, renderEvaluation, renderCoachAnswer, closeCoachModal, fetchCoachAnswer } from "./panels.js";
import { setStatus, showToast, setAnswerFormLocked, escapeHtml } from "./ui.js";
import { state, setInterviewActive, setActiveProvider, setAdaptiveState, pushScore, resetState } from "./state.js";
import { speakText, stopSpeaking } from "./speech.js";
import { startUserCamera, stopUserCamera } from "./camera.js";
import {
  showReactionBubble, showInterruptBubble, removeInterruptBubble,
  showNudgeBubble, removeNudgeBubble, showClarificationBubble,
} from "./conversational.js";

// Natural conversational fillers
const fillers = ["So,", "Alright,", "Okay,", "Good.", "Let's see.", "Hmm,", "Interesting.", "Well,"];

function speakQuestionNaturally(msg) {
  const filler   = fillers[Math.floor(Math.random() * fillers.length)];
  const spokenText = `${filler} ${msg}`;
  speakText(spokenText, (revealedText) => {
    let display = revealedText;
    if (revealedText.startsWith(filler)) display = revealedText.slice(filler.length).trim();
    document.getElementById("aq-text").textContent = display;
  });
}

let _pendingRound = { question: "", answer: "" };

// ── Inactivity / nudge timer ──────────────────────────────────────────────────
let _inactivityTimer    = null;
let _nudgeDismissed     = false;
const NUDGE_DELAY_MS    = 20_000; // 20 seconds

function _resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  removeNudgeBubble();
  _nudgeDismissed = false;
  _inactivityTimer = setTimeout(_sendNudge, NUDGE_DELAY_MS);
}

async function _sendNudge() {
  if (_nudgeDismissed || !state.interviewActive) return;
  try {
    const data = await apiNudge();
    if (data.nudge_message) showNudgeBubble(data.nudge_message);
  } catch { /* silently ignore */ }
}

// ── Mid-answer interrupt ──────────────────────────────────────────────────────
let _interruptFiredThisRound = false;
const INTERRUPT_WORD_THRESHOLD = 60;

async function _maybeInterrupt(text) {
  if (_interruptFiredThisRound) return;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < INTERRUPT_WORD_THRESHOLD) return;

  _interruptFiredThisRound = true; // gate immediately — only one attempt per round

  try {
    const data = await apiInterrupt(text);
    if (data.should_interrupt && data.interrupt_message) {
      showInterruptBubble(data.interrupt_message);
    }
  } catch { /* silently ignore */ }
}

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
    startUserCamera();
    setStatus("Live Interview", true);

    const msg = data.recruiter_message || data.recruiter_message_local || "";
    _pendingRound.question = msg;
    showQuestion(msg);
    speakQuestionNaturally(msg);

    // Wire up inactivity detection
    _attachTextareaListeners();
  } catch {
    showToast("Connection failed. Check your API key.");
    btnStart.disabled    = false;
    btnStart.textContent = "Start Interview →";
    setStatus("Error");
  }
}

// Max words allowed to appear in a single input event (typing physically produces 1 word at a time)
const PASTE_WORD_THRESHOLD = 8;

function _attachTextareaListeners() {
  const input = document.getElementById("answer-input");

  // Block paste via keyboard shortcut and context menu
  input.addEventListener("paste", _onPaste);

  // Secondary guard: catch bulk text that slips in via drag-drop or browser autofill
  input.addEventListener("input", _onAnswerInput);
}

function _onPaste(e) {
  e.preventDefault();
  showToast("Paste is disabled — please type your answer or use the mic 🎙");
}

function _onAnswerInput(e) {
  const input = e.target;

  // Detect drag-drop or autofill: if word count jumped by more than threshold in one event, strip the addition
  const previousWordCount = (input.dataset.prevWordCount | 0);
  const currentWordCount  = input.value.trim().split(/\s+/).filter(Boolean).length;
  const delta             = currentWordCount - previousWordCount;

  if (delta > PASTE_WORD_THRESHOLD) {
    // Roll back: restore previous value stored before this event
    input.value = input.dataset.prevValue || "";
    showToast("Paste is disabled — please type your answer or use the mic 🎙");
    return;
  }

  // Keep a snapshot for the next event
  input.dataset.prevValue     = input.value;
  input.dataset.prevWordCount = currentWordCount;

  _resetInactivityTimer();
  _maybeInterrupt(input.value);
}

/* ── Submit answer ───────────────────────────────────────────────────────── */

export async function submitAnswer() {
  stopSpeaking();
  const input  = document.getElementById("answer-input");
  const answer = input.value.trim();
  if (!answer) { showToast("Please write an answer first."); return; }

  const question = _pendingRound.question;

  // Clear timers / bubbles from conversational modes
  clearTimeout(_inactivityTimer);
  removeNudgeBubble();
  removeInterruptBubble();
  _nudgeDismissed          = false;
  _interruptFiredThisRound = false;

  // ── Auto-clarification: if answer is very short, ask for clarification first
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const awaitingClarification = state.awaitingClarification;

  if (wordCount < 25 && !awaitingClarification) {
    setAnswerFormLocked(true);
    input.value = "";
    document.getElementById("char-count").textContent = "0 chars";
    showTyping();

    try {
      const data = await apiClarify(answer);
      hideTyping();
      if (data.error) { showToast(data.error); return; }

      // Show clarification bubble and mark state
      showClarificationBubble(data.clarification_question);
      state.awaitingClarification = true;
      speakQuestionNaturally(data.clarification_question);
    } catch {
      hideTyping();
      showToast("Something went wrong. Try again.");
    } finally {
      setAnswerFormLocked(false);
      input.focus();
    }
    return;
  }

  // ── Normal submit ─────────────────────────────────────────────────────────
  state.awaitingClarification = false;

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

    // Show reaction bubble before sealing the round
    if (data.recruiter_reaction) {
      showReactionBubble(data.recruiter_reaction);
      await _delay(1800); // let the reaction sit for a moment
    }

    sealRound({
      question:  question,
      answer:    answer,
      score:     data.score             || null,
      refData:   data.reference_answer  || null,
      coachText: data.coach_feedback    || null,
    });

    const nextQ = data.recruiter_message || data.recruiter_message_local || "";
    _pendingRound.question = nextQ;
    showQuestion(nextQ);
    speakQuestionNaturally(nextQ);

    // Reset coach panel for new round
    document.getElementById("coach-answer-container").style.display = "none";
    const coachBtn = document.getElementById("btn-coach-answer");
    if (coachBtn) {
      coachBtn.disabled    = false;
      coachBtn.textContent = "Get Coach Answer";
    }

    // Restart inactivity timer for the new question
    _resetInactivityTimer();
  } catch {
    hideTyping();
    showToast("Something went wrong. Try again.");
  } finally {
    setAnswerFormLocked(false);
    input.focus();
  }
}

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ── Skip ────────────────────────────────────────────────────────────────── */

export async function skipQuestion() {
  stopSpeaking();
  clearTimeout(_inactivityTimer);
  removeNudgeBubble();
  removeInterruptBubble();
  _interruptFiredThisRound = false;

  const question = _pendingRound.question;
  setAnswerFormLocked(true);
  document.getElementById("btn-skip").disabled = true;
  showTyping();

  try {
    const data = await apiSkip();
    hideTyping();
    if (data.error) { showToast(data.error); return; }

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

    _resetInactivityTimer();
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

  clearTimeout(_inactivityTimer);
  removeNudgeBubble();
  removeInterruptBubble();

  apiReset().finally(() => {
    resetState();
    stopUserCamera();
    _pendingRound = { question: "", answer: "" };
    _interruptFiredThisRound = false;

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

  clearTimeout(_inactivityTimer);
  removeNudgeBubble();

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

    // Show closing remark if present
    if (data.closing_message) {
      showReactionBubble(data.closing_message);
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
    resumeSession(data);
  } catch { /* Silently fail */ }
}

function resumeSession(data) {
  document.getElementById("setup-panel").style.display  = "none";
  document.getElementById("chip-topic").textContent     = data.topic;
  document.getElementById("chip-level").textContent     = data.difficulty;
  document.getElementById("interview-panel").classList.add("active");

  setInterviewActive(true);
    startUserCamera();
  state.roundCount = data.round  || 0;
  state.scores     = data.scores || [];
  setStatus("Live Interview", true);

  const history = data.history || [];
  for (let i = 0; i < history.length - 1; i += 2) {
    const q = history[i]?.role === "assistant" ? history[i].content : "";
    const a = history[i + 1]?.role === "user"  ? history[i + 1].content : "";
    if (q) sealRound({ question: q, answer: a, score: null, refData: null, coachText: null });
  }

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

  _attachTextareaListeners();
  _resetInactivityTimer();
}

export function downloadTranscript() {
  window.location.href = "/download-pdf";
}

window.addEventListener("beforeunload", (e) => {
  if (state.interviewActive) {
    e.preventDefault();
    e.returnValue = "";
  }
});