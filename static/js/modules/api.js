/**
 * api.js
 * ───────
 * All async fetch calls to the Flask backend.
 * Functions here return data; they do NOT directly mutate the DOM.
 */

export async function apiStart(topic, difficulty, prepQuestions = []) {
  const res = await fetch("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, difficulty, prep_questions: prepQuestions }),
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

export async function apiClarify(answer) {
  const res = await fetch("/clarify", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ answer }),
  });
  return res.json();
}

export async function apiInterrupt(partialAnswer) {
  const res = await fetch("/interrupt", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ partial_answer: partialAnswer }),
  });
  return res.json();
}

export async function apiNudge() {
  const res = await fetch("/nudge", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
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

export async function apiGetQuestions(topic, difficulty, offset=0) {
  const res = await fetch("/questions", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ topic, difficulty, offset }),
  });
  return res.json();
}

export async function apiDownloadPrepPDF(topic, difficulty, questions) {
  const res = await fetch("/prep-pdf", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ topic, difficulty, questions }),
  });
  if(!res.ok) {
    throw new Error("Failed to generate PDF.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href    = url;
  a.download = `mockmind_prep_${topic.replace(/[\s\/]+/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
