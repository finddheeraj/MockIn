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
import { fetchCoachAnswer, closeCoachModal, closeEvaluation } from "./modules/panels.js";
import { toggleSpeech, initSpeechRecognition, toggleNarration, initNarration } from "./modules/speech.js";
import {
  startInterview, submitAnswer, skipQuestion,
  resetInterview, endAndEvaluate, checkForExistingSession, downloadTranscript,
  previewQuestions, closeQuestionsPreview, loadMoreQuestions, downloadPrepPDF, toggleQAItem,
} from "./modules/session.js";
import {
  openQuickRevision, updateQuickRevisionSubtopics, onQuickRevisionSubtopicChange,
  fetchQuickRevisionQuestions, closeQuickRevision, toggleMindmapBranch,
} from "./modules/quickRevision.js";
import { state } from "./modules/state.js";
import { toggleRoundCard, switchRoundTab } from "./modules/chat.js";
import { generateResumeQuestions, closeResumeQuestions, initResumeUpload } from "./modules/resume.js";

/* ── Expose to inline HTML handlers ─────────────────────────────────────── */
window.startInterview     = startInterview;
window.submitAnswer       = submitAnswer;
window.skipQuestion       = skipQuestion;
window.resetInterview     = resetInterview;
window.endAndEvaluate     = endAndEvaluate;
window.getCoachAnswer     = fetchCoachAnswer;
window.closeCoachModal    = closeCoachModal;
window.closeEvaluation    = closeEvaluation;
window.toggleSpeech       = toggleSpeech;
window.downloadTranscript = downloadTranscript;
window.updateCharCount    = updateCharCount;
window.toggleRoundCard    = toggleRoundCard;
window.switchRoundTab     = switchRoundTab;
window.toggleNarration    = toggleNarration;
window.previewQuestions   = previewQuestions;
window.closeQuestionsPreview = closeQuestionsPreview;
window.loadMoreQuestions  = loadMoreQuestions;
window.downloadPrepPDF    = downloadPrepPDF;
window.toggleQAItem       = toggleQAItem;
window.openQuickRevision  = openQuickRevision;
window.updateQuickRevisionSubtopics = updateQuickRevisionSubtopics;
window.onQuickRevisionSubtopicChange = onQuickRevisionSubtopicChange;
window.fetchQuickRevisionQuestions = fetchQuickRevisionQuestions;
window.toggleMindmapBranch = toggleMindmapBranch;
window.closeQuickRevision = closeQuickRevision;
window.generateResumeQuestions = generateResumeQuestions;
window.closeResumeQuestions = closeResumeQuestions;

/* ── Keyboard shortcut: Ctrl/Cmd+Enter submits answer ───────────────────── */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && state.interviewActive) {
    submitAnswer();
  }
});

/* ── Initialise on load ──────────────────────────────────────────────────── */
initSpeechRecognition();
checkForExistingSession();
initNarration();
initResumeUpload();
