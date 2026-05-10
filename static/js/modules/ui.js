/**
 * ui.js
 * ──────
 * Tiny, stateless DOM helpers used across the app.
 * Nothing here owns state; everything is a pure side-effect.
 */

/** Update the status indicator in the header. */
export function setStatus(text, live = false) {
  document.getElementById("status-text").textContent = text;
  document.getElementById("status-dot").className    = "status-dot" + (live ? " live" : "");
}

/** Show a temporary error/info toast in the bottom-right corner. */
export function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

/** Keep the character counter below the textarea up to date. */
export function updateCharCount(el) {
  document.getElementById("char-count").textContent = el.value.length + " chars";
}

/** Prevent XSS — escape user/AI text before injecting into innerHTML. */
export function escapeHtml(text) {
  return text
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/\n/g, "<br>");
}

/** Lock/unlock the answer form while a request is in flight. */
export function setAnswerFormLocked(locked) {
  const btn     = document.getElementById("btn-submit");
  const spinner = document.getElementById("submit-spinner");
  const input   = document.getElementById("answer-input");

  btn.disabled          = locked;
  input.disabled        = locked;
  spinner.style.display = locked ? "block" : "none";
}
