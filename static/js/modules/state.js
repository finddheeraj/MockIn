/**
 * state.js
 * ─────────
 * Single source of truth for all runtime state.
 * All other modules import from here.
 */

export const state = {
  interviewActive:      false,
  roundCount:           0,
  activeProvider:       "grok",
  scores:               [],
  adaptiveState:        null,
  awaitingClarification: false,  // NEW: true when /clarify has been called and score is deferred
};

export function setInterviewActive(val)        { state.interviewActive      = val; }
export function setActiveProvider(val)         { state.activeProvider       = val; }
export function setAdaptiveState(val)          { state.adaptiveState        = val; }
export function incrementRound()               { state.roundCount++;               }
export function pushScore(score)               { state.scores.push(score);         }
export function setAwaitingClarification(val)  { state.awaitingClarification = val; }

export function resetState() {
  state.interviewActive       = false;
  state.roundCount            = 0;
  state.activeProvider        = "grok";
  state.scores                = [];
  state.adaptiveState         = null;
  state.awaitingClarification = false;
}
