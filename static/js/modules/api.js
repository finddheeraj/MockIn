/**
 * api.js
 * ───────
 * All async fetch calls to the Flask backend.
 * Functions here return data; they do NOT directly mutate the DOM.
 * Callers in app.js are responsible for consuming results and updating UI.
 */

export async function apiStart(topic, difficulty) {
  const res = await fetch("/start", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ topic, difficulty }),
  });
  return res.json();
}

export async function apiAnswer(answer) {
  const res = await fetch("/answer", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ answer }),
  });
  return res.json();
}

export async function apiSkip() {
  const res = await fetch("/skip", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function apiReset() {
  return fetch("/reset", { method: "POST" });
}

export async function apiEnd() {
  const res = await fetch("/end", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function apiCoachAnswer() {
  const res = await fetch("/coach-answer", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function apiSessionStatus() {
  const res = await fetch("/session-status");
  return res.json();
}
