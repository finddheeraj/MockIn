/**
 * state.js
 * ─────────
 * Single source of truth for all runtime state.
 * All other modules import from here — no other file holds global mutable state.
 */

export const state = {
  interviewActive: false,
  roundCount:      0,
  activeProvider:  "grok",
  scores:          [],
  adaptiveState:   null,
};

/** Convenience setters that keep mutations explicit. */
export function setInterviewActive(val) { state.interviewActive = val; }
export function setActiveProvider(val)  { state.activeProvider  = val; }
export function setAdaptiveState(val)   { state.adaptiveState   = val; }
export function incrementRound()        { state.roundCount++; }
export function pushScore(score)        { state.scores.push(score); }

export function resetState() {
  state.interviewActive = false;
  state.roundCount      = 0;
  state.activeProvider  = "grok";
  state.scores          = [];
  state.adaptiveState   = null;
}
