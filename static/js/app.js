/**
 * app.js — entrypoint
 * ────────────────────
 * Imports all modules and wires up global event listeners.
 * No business logic lives here — it only connects UI events to module functions.
 *
 * Module map:
 *   state.js    → runtime state (interviewActive, scores, etc.)
 *   ui.js       → DOM helpers (toast, status, char count)
 *   chat.js     → message bubbles, typing indicator, coach entries
 *   panels.js   → score, reference, adaptive, eval overlay rendering
 *   api.js      → fetch wrappers for every Flask endpoint
 *   session.js  → session lifecycle (start, submit, skip, reset, evaluate, resume)
 *   speech.js   → Web Speech API wrapper
 */

import { updateCharCount } from "./modules/ui.js";
import { fetchCoachAnswer, closeEvaluation } from "./modules/panels.js";
import { toggleSpeech, initSpeechRecognition } from "./modules/speech.js";
import {
  startInterview,
  submitAnswer,
  skipQuestion,
  resetInterview,
  endAndEvaluate,
  checkForExistingSession,
  downloadTranscript,
} from "./modules/session.js";
import { state } from "./modules/state.js";

/* ── Expose to inline HTML handlers ─────────────────────────────────────── */
// The HTML uses onclick="startInterview()" etc., so these must be on window.
window.startInterview     = startInterview;
window.submitAnswer       = submitAnswer;
window.skipQuestion       = skipQuestion;
window.resetInterview     = resetInterview;
window.endAndEvaluate     = endAndEvaluate;
window.getCoachAnswer     = fetchCoachAnswer;
window.closeEvaluation    = closeEvaluation;
window.toggleSpeech       = toggleSpeech;
window.downloadTranscript = downloadTranscript;
window.updateCharCount    = updateCharCount;

/* ── Keyboard shortcut: Ctrl/Cmd+Enter submits answer ───────────────────── */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && state.interviewActive) {
    submitAnswer();
  }
});

/* ── Initialise on load ──────────────────────────────────────────────────── */
initSpeechRecognition();
checkForExistingSession();
