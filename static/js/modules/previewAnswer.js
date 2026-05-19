/**
 * previewAnswer.js — format Q&A answer text for preview modals.
 */

import { escapeHtml } from "./ui.js";

function renderAnswerInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function cleanAnswerMarker(line) {
  return line
    .replace(/^(\s*(?:[-+*]|\d+\.|â€¢|\u2022)\s*)+/, "")
    .replace(/^\*+\s*/, "")
    .trim();
}

export function renderPreviewAnswer(answer) {
  const lines = (answer || "").split("\n");
  const html = [];
  let listItems = [];

  function flushList() {
    if (listItems.length === 0) return;
    html.push(`<ul class="qs-answer-list">${listItems.join("")}</ul>`);
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const isBullet = /^(\s*(?:[-+*]|\d+\.|â€¢|\u2022)\s*)+/.test(rawLine);
    const cleaned = cleanAnswerMarker(line);
    const plain = cleaned.replace(/\*\*/g, "").trim();

    if (!plain) continue;

    const isSection =
      /^\*+\s*\*\*.+\*\*:?\s*$/.test(line) ||
      (/^[A-Z][A-Za-z\s]+:$/.test(plain) && plain.length <= 40);

    if (isSection) {
      flushList();
      html.push(`<div class="qs-answer-section">${renderAnswerInline(plain.replace(/:$/, ""))}</div>`);
      continue;
    }

    if (isBullet) {
      listItems.push(`<li>${renderAnswerInline(cleaned)}</li>`);
      continue;
    }

    flushList();
    html.push(`<p class="qs-answer-paragraph">${renderAnswerInline(cleaned)}</p>`);
  }

  flushList();

  if (html.length === 0) {
    return '<p class="qs-answer-empty">Answer not available yet.</p>';
  }

  return html.join("");
}
