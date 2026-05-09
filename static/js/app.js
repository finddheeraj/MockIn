/* static/js/app.js
   ─────────────────────────────────────────────────────────────────────────────
   Client-side logic for MockMind, split into five clear responsibilities:

     1. State        — simple JS variables that track what's happening
     2. UI helpers   — tiny functions that touch the DOM (toast, status, etc.)
     3. Chat         — functions that render messages & the coach panel
     4. API calls    — async functions that talk to the Flask backend
     5. Wiring       — event listeners that connect UI events to the above
   ─────────────────────────────────────────────────────────────────────────────
*/

/* ── 1. State ─────────────────────────────────────────────────────────────── */

let interviewActive = false;
let roundCount      = 0;
let activeProvider  = "grok";
let scores          = [];
let adaptiveState   = null;


/* ── 2. UI helpers ────────────────────────────────────────────────────────── */

/** Update the status indicator in the header. */
function setStatus(text, live = false) {
  document.getElementById("status-text").textContent = text;
  document.getElementById("status-dot").className    = "status-dot" + (live ? " live" : "");
}

/** Show a temporary error/info toast in the bottom-right corner. */
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

/** Keep the character counter below the textarea up to date. */
function updateCharCount(el) {
  document.getElementById("char-count").textContent = el.value.length + " chars";
}

/** Prevent XSS — escape user/AI text before injecting into innerHTML. */
function escapeHtml(text) {
  return text
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/\n/g, "<br>");
}

/** Lock/unlock the answer form while a request is in flight. */
function setAnswerFormLocked(locked) {
  const btn     = document.getElementById("btn-submit");
  const spinner = document.getElementById("submit-spinner");
  const input   = document.getElementById("answer-input");

  btn.disabled           = locked;
  input.disabled         = locked;
  spinner.style.display  = locked ? "block" : "none";
}


/* ── 3. Chat rendering ────────────────────────────────────────────────────── */

/**
 * Append a message bubble to the chat area.
 * @param {"recruiter"|"candidate"} role
 * @param {string} text
 * @param {string} [modelTag] — optional model label (e.g. "Grok", "Llama-3.1-8B")
 */
function addMessage(role, text, modelTag) {
  const chatArea = document.getElementById("chat-area");
  const empty    = document.getElementById("chat-empty");
  if (empty) empty.remove();

  const isRecruiter = role === "recruiter";
  const tagHtml = modelTag ? `<span class="model-tag ${modelTag.toLowerCase().includes("llama") ? "local" : "grok"}">${escapeHtml(modelTag)}</span>` : "";

  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML = `
    <div class="msg-avatar ${isRecruiter ? "recruiter" : "candidate"}">
      ${isRecruiter ? "I" : "U"}
    </div>
    <div class="msg-body">
      <div class="msg-label ${isRecruiter ? "recruiter" : "candidate"}">
        ${isRecruiter ? "Interviewer" : "You"} ${tagHtml}
      </div>
      <div class="msg-text">${escapeHtml(text)}</div>
    </div>
  `;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

/** Show animated dots while waiting for the recruiter's reply. */
function addTypingIndicator() {
  const chatArea = document.getElementById("chat-area");
  const div      = document.createElement("div");
  div.className  = "message";
  div.id         = "typing";
  div.innerHTML  = `
    <div class="msg-avatar recruiter">I</div>
    <div class="msg-body">
      <div class="msg-label recruiter">Interviewer</div>
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function removeTypingIndicator() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

/**
 * Prepend a new coach feedback card to the coach panel.
 * @param {string} text
 * @param {string} [modelTag] — optional model label
 * @param {boolean} [skipRoundIncrement] — set true when adding a second model's feedback for the same round
 */
function addCoachFeedback(text, modelTag, skipRoundIncrement) {
  if (!skipRoundIncrement) roundCount++;

  const empty = document.getElementById("coach-empty");
  if (empty) empty.style.display = "none";

  const entries = document.getElementById("coach-entries");
  entries.style.display = "flex";

  const tagHtml = modelTag ? `<span class="model-tag ${modelTag.toLowerCase().includes("llama") ? "local" : "grok"}">${escapeHtml(modelTag)}</span>` : "";

  const div       = document.createElement("div");
  div.className   = "coach-entry";
  div.innerHTML   = `
    <div class="coach-entry-round">Round ${roundCount} ${tagHtml}</div>
    <div class="coach-entry-text">${escapeHtml(text)}</div>
  `;
  entries.insertBefore(div, entries.firstChild);
}


/* ── 4. API calls ─────────────────────────────────────────────────────────── */

/**
 * POST /start — initialise a session and get the opening question.
 * Switches from the setup panel to the interview panel on success.
 */
async function startInterview() {
  const topic      = document.getElementById("topic-select").value;
  const difficulty = document.getElementById("difficulty-select").value;

  const btnStart   = document.getElementById("btn-start");
  btnStart.disabled    = true;
  btnStart.textContent = "Connecting…";
  setStatus("Connecting…");

  try {
    const res  = await fetch("/start", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ topic, difficulty }),
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error);
      return;
    }

    // ── Track active provider ─────────────────────────────────────────────
    activeProvider = data.provider || "grok";

    // ── Switch to interview view ──────────────────────────────────────────
    document.getElementById("setup-panel").style.display = "none";
    document.getElementById("chip-topic").textContent    = topic;
    document.getElementById("chip-level").textContent    = difficulty;
    document.getElementById("interview-panel").classList.add("active");
    document.getElementById("btn-download").style.display = "inline-flex";
    interviewActive = true;
    setStatus("Live Interview", true);

    if (activeProvider === "both") {
      if (data.recruiter_message)       addMessage("recruiter", data.recruiter_message, "Grok");
      if (data.recruiter_message_local) addMessage("recruiter", data.recruiter_message_local, "Llama-3.1-8B");
    } else {
      addMessage("recruiter", data.recruiter_message);
    }

  } catch {
    showToast("Connection failed. Check your API key.");
    btnStart.disabled    = false;
    btnStart.textContent = "Start Interview →";
    setStatus("Error");
  }
}

/**
 * POST /answer — submit the candidate's answer to both agents.
 * Displays the recruiter's follow-up + coach feedback on success.
 */
async function submitAnswer() {
  const input  = document.getElementById("answer-input");
  const answer = input.value.trim();

  if (!answer) {
    showToast("Please write an answer first.");
    return;
  }

  setAnswerFormLocked(true);
  addMessage("candidate", answer);

  input.value = "";
  document.getElementById("char-count").textContent = "0 chars";

  addTypingIndicator();

  try {
    const res  = await fetch("/answer", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ answer }),
    });
    const data = await res.json();

    removeTypingIndicator();

    if (data.error) {
      showToast(data.error);
      return;
    }

    // Reset coach answer for new round
    document.getElementById("coach-answer-container").style.display = "none";
    document.getElementById("btn-coach-answer").style.display = "inline-flex";

    // Render score, adaptive state, and reference answer
    if (data.score) {
      scores.push(data.score);
      renderScore(data.score);
    }
    if (data.adaptive) {
      adaptiveState = data.adaptive;
      updateAdaptiveIndicator(data.adaptive);
    }
    if (data.reference_answer) {
      renderReferenceAnswer(data.reference_answer);
    }

    if (data.provider === "both") {
      if (data.recruiter_message)       addMessage("recruiter", data.recruiter_message, "Grok");
      if (data.recruiter_message_local) addMessage("recruiter", data.recruiter_message_local, "Llama-3.1-8B");

      if (data.coach_feedback)          addCoachFeedback(data.coach_feedback, "Grok");
      if (data.coach_feedback_local)    addCoachFeedback(data.coach_feedback_local, "Llama-3.1-8B", true);
    } else {
      addMessage("recruiter", data.recruiter_message);
      if (data.coach_feedback) {
        addCoachFeedback(data.coach_feedback);
      }
    }

  } catch {
    removeTypingIndicator();
    showToast("Something went wrong. Try again.");
  } finally {
    setAnswerFormLocked(false);
    input.focus();
  }
}

/**
 * POST /skip — skip the current question and get a new one.
 */
async function skipQuestion() {
  setAnswerFormLocked(true);
  document.getElementById("btn-skip").disabled = true;
  addMessage("candidate", "[Skipped]");
  addTypingIndicator();

  try {
    const res = await fetch("/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();

    removeTypingIndicator();

    if (data.error) {
      showToast(data.error);
      return;
    }

    // Reset coach answer for new question
    document.getElementById("coach-answer-container").style.display = "none";
    document.getElementById("btn-coach-answer").style.display = "inline-flex";

    if (data.provider === "both") {
      if (data.recruiter_message) addMessage("recruiter", data.recruiter_message, "Grok");
      if (data.recruiter_message_local) addMessage("recruiter", data.recruiter_message_local, "Llama-3.1-8B");
    } else {
      addMessage("recruiter", data.recruiter_message);
    }
  } catch {
    removeTypingIndicator();
    showToast("Failed to skip. Try again.");
  } finally {
    setAnswerFormLocked(false);
    document.getElementById("btn-skip").disabled = false;
    document.getElementById("answer-input").focus();
  }
}

/**
 * POST /reset — clear session and return to the setup screen.
 */
function resetInterview() {
  if (!confirm("End this session and start over?")) return;

  fetch("/reset", { method: "POST" }).finally(() => {
    interviewActive = false;
    roundCount      = 0;
    scores          = [];
    adaptiveState   = null;

    // Reset interview panel contents
    document.getElementById("interview-panel").classList.remove("active");
    document.getElementById("score-panel").style.display = "none";
    document.getElementById("reference-panel").style.display = "none";
    document.getElementById("chip-adaptive").style.display = "none";
    document.getElementById("chat-area").innerHTML = `
      <div class="chat-empty" id="chat-empty">
        <div class="chat-empty-icon">Q</div>
        <span>Interview starting…</span>
      </div>
    `;
    document.getElementById("coach-entries").innerHTML  = "";
    document.getElementById("coach-entries").style.display = "none";
    document.getElementById("coach-empty").style.display   = "flex";
    document.getElementById("coach-answer-container").style.display = "none";
    document.getElementById("btn-coach-answer").style.display = "inline-flex";

    // Show setup panel
    document.getElementById("setup-panel").style.display = "flex";

    // Reset start button
    const btnStart       = document.getElementById("btn-start");
    btnStart.disabled    = false;
    btnStart.textContent = "Start Interview →";

    setStatus("Ready");
  });
}


/* ── 5. Agentic UI — Scores, Adaptive Indicator, Evaluation ───────────────── */

function renderScore(scoreData) {
  const panel = document.getElementById("score-panel");
  panel.style.display = "block";

  document.getElementById("score-round-label").textContent = `Round ${scoreData.round || roundCount}`;

  const overall = scoreData.overall || 0;
  const overallEl = document.getElementById("score-overall");
  overallEl.innerHTML = `<span class="score-number">${overall.toFixed(1)}</span><span class="score-max">/10</span>`;
  overallEl.className = "score-overall " + (overall >= 7 ? "good" : overall >= 5 ? "ok" : "low");

  const dims = scoreData.dimensions || {};
  const dimsEl = document.getElementById("score-dimensions");
  dimsEl.innerHTML = Object.entries(dims).map(([key, val]) => `
    <div class="dim-row">
      <span class="dim-label">${key}</span>
      <div class="dim-bar"><div class="dim-fill ${val >= 7 ? 'good' : val >= 5 ? 'ok' : 'low'}" style="width:${val * 10}%"></div></div>
      <span class="dim-val">${val}</span>
    </div>
  `).join("");

  const rationale = scoreData.brief_rationale || "";
  document.getElementById("score-rationale").textContent = rationale;
}

function renderReferenceAnswer(refData) {
  const panel = document.getElementById("reference-panel");
  const content = document.getElementById("reference-content");

  if (!refData || (!refData.key_concepts && !refData.ideal_answer_points)) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";

  let html = "";

  if (refData.key_concepts && refData.key_concepts.length) {
    html += `<div class="ref-section"><div class="ref-label">Key Concepts</div><ul class="ref-list">`;
    refData.key_concepts.forEach(c => { html += `<li>${escapeHtml(c)}</li>`; });
    html += `</ul></div>`;
  }

  if (refData.ideal_answer_points && refData.ideal_answer_points.length) {
    html += `<div class="ref-section"><div class="ref-label">Ideal Answer Points</div><ul class="ref-list">`;
    refData.ideal_answer_points.forEach(p => { html += `<li>${escapeHtml(p)}</li>`; });
    html += `</ul></div>`;
  }

  if (refData.common_mistakes && refData.common_mistakes.length) {
    html += `<div class="ref-section"><div class="ref-label">Common Mistakes</div><ul class="ref-list mistakes">`;
    refData.common_mistakes.forEach(m => { html += `<li>${escapeHtml(m)}</li>`; });
    html += `</ul></div>`;
  }

  content.innerHTML = html;
}

function updateAdaptiveIndicator(adaptiveData) {
  if (!adaptiveData) return;
  const chip = document.getElementById("chip-adaptive");
  const actionLabels = {
    drill_deeper: "Drilling deeper",
    switch_to_weak_area: "Switching topic",
    increase_difficulty: "Increasing difficulty",
    decrease_difficulty: "Easing up",
    new_subtopic: "New subtopic",
  };
  chip.textContent = actionLabels[adaptiveData.action] || adaptiveData.action;
  chip.style.display = "inline-block";
  chip.title = adaptiveData.reasoning || "";
}

/**
 * POST /coach-answer — get a model-generated ideal answer for the current question.
 * Displays persistently in the coach panel.
 */
async function getCoachAnswer() {
  const btn = document.getElementById("btn-coach-answer");
  btn.disabled = true;
  btn.textContent = "Generating…";

  try {
    const res = await fetch("/coach-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error);
      return;
    }

    renderCoachAnswer(data.coach_answer);
    btn.style.display = "none";
  } catch {
    showToast("Failed to generate answer.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Get Coach Answer";
  }
}

function renderCoachAnswer(text) {
  const container = document.getElementById("coach-answer-container");
  container.style.display = "block";
  document.getElementById("coach-answer-text").textContent = text;
}

async function endAndEvaluate() {
  if (roundCount < 2) {
    showToast("Need at least 2 rounds for evaluation.");
    return;
  }

  const overlay = document.getElementById("eval-overlay");
  const content = document.getElementById("eval-content");
  overlay.style.display = "flex";
  content.innerHTML = '<div class="eval-loading">Generating evaluation…</div>';

  try {
    const res = await fetch("/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();

    if (data.error) {
      content.innerHTML = `<div class="eval-error">${escapeHtml(data.error)}</div>`;
      return;
    }

    renderEvaluation(data.evaluation);
  } catch {
    content.innerHTML = '<div class="eval-error">Failed to generate evaluation.</div>';
  }
}

function renderEvaluation(evalData) {
  const content = document.getElementById("eval-content");

  const dimAvgs = evalData.dimension_averages || {};
  const dimHtml = Object.entries(dimAvgs).map(([k, v]) => `
    <div class="dim-row">
      <span class="dim-label">${k}</span>
      <div class="dim-bar"><div class="dim-fill ${v >= 7 ? 'good' : v >= 5 ? 'ok' : 'low'}" style="width:${v * 10}%"></div></div>
      <span class="dim-val">${typeof v === 'number' ? v.toFixed(1) : v}</span>
    </div>
  `).join("");

  const strengthsHtml = (evalData.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join("");
  const weaknessesHtml = (evalData.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join("");
  const patternsHtml = (evalData.patterns || []).map(p => `<li>${escapeHtml(p)}</li>`).join("");

  const planHtml = (evalData.improvement_plan || []).map(item => `
    <div class="plan-item priority-${item.priority || 'medium'}">
      <div class="plan-area">${escapeHtml(item.area || '')}</div>
      <div class="plan-action">${escapeHtml(item.action || '')}</div>
      <div class="plan-resources">${escapeHtml(item.resources || '')}</div>
    </div>
  `).join("");

  content.innerHTML = `
    <div class="eval-grade">
      <span class="eval-grade-letter">${escapeHtml(evalData.overall_grade || 'N/A')}</span>
      <span class="eval-grade-score">${(evalData.overall_score || 0).toFixed(1)}/10</span>
    </div>

    <div class="eval-section">
      <h3>Dimension Breakdown</h3>
      <div class="eval-dimensions">${dimHtml}</div>
    </div>

    <div class="eval-columns">
      <div class="eval-section">
        <h3>Strengths</h3>
        <ul class="eval-list strengths">${strengthsHtml || '<li>—</li>'}</ul>
      </div>
      <div class="eval-section">
        <h3>Weaknesses</h3>
        <ul class="eval-list weaknesses">${weaknessesHtml || '<li>—</li>'}</ul>
      </div>
    </div>

    ${patternsHtml ? `<div class="eval-section"><h3>Patterns Observed</h3><ul class="eval-list patterns">${patternsHtml}</ul></div>` : ''}

    <div class="eval-section">
      <h3>Improvement Plan</h3>
      <div class="eval-plan">${planHtml || '<p>No specific recommendations.</p>'}</div>
    </div>

    <div class="eval-section">
      <h3>Summary</h3>
      <p class="eval-summary">${escapeHtml(evalData.summary || '')}</p>
    </div>
  `;
}

function closeEvaluation() {
  document.getElementById("eval-overlay").style.display = "none";
}

function downloadTranscript() {
  window.location.href = "/download-pdf";
}


/* ── 6. Speech Recognition (Web Speech API) ───────────────────────────────── */

let recognition  = null;
let isListening  = false;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById("btn-mic").style.display = "none";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous   = true;
  recognition.interimResults = true;
  recognition.lang         = "en-US";

  let finalTranscript = "";

  recognition.onstart = () => {
    isListening = true;
    document.getElementById("btn-mic").classList.add("listening");
    document.getElementById("mic-pulse").style.display = "block";
    document.getElementById("speech-status").textContent = "Listening…";
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }
    const input = document.getElementById("answer-input");
    input.value = finalTranscript + interim;
    updateCharCount(input);
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById("btn-mic").classList.remove("listening");
    document.getElementById("mic-pulse").style.display = "none";
    document.getElementById("speech-status").textContent = "";
    finalTranscript = "";
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") {
      showToast("Microphone access denied. Check browser permissions.");
    } else if (event.error !== "aborted") {
      showToast("Speech error: " + event.error);
    }
    isListening = false;
    document.getElementById("btn-mic").classList.remove("listening");
    document.getElementById("mic-pulse").style.display = "none";
    document.getElementById("speech-status").textContent = "";
  };
}

function toggleSpeech() {
  if (!recognition) {
    showToast("Speech recognition not supported in this browser.");
    return;
  }
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

initSpeechRecognition();


/* ── 7. Wiring ────────────────────────────────────────────────────────────── */

// Ctrl+Enter submits the answer (faster than clicking the button)
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && interviewActive) {
    submitAnswer();
  }
});


/* ── 8. Session Resumption ───────────────────────────────────────────────── */

/**
 * On page load, check if the server has an active session for this browser.
 * If so, offer to resume or start fresh.
 */
async function checkForExistingSession() {
  try {
    const res = await fetch("/session-status");
    const data = await res.json();

    if (!data.active) return;

    const resume = confirm(
      `You have an active interview in progress:\n\n` +
      `Topic: ${data.topic}\n` +
      `Difficulty: ${data.difficulty}\n` +
      `Round: ${data.round}\n\n` +
      `Would you like to resume? (Cancel to start fresh)`
    );

    if (resume) {
      resumeSession(data);
    } else {
      await fetch("/reset", { method: "POST" });
    }
  } catch {
    // Silently fail — show setup panel as normal
  }
}

/**
 * Restore the interview UI from existing session data.
 */
function resumeSession(data) {
  document.getElementById("setup-panel").style.display = "none";
  document.getElementById("chip-topic").textContent = data.topic;
  document.getElementById("chip-level").textContent = data.difficulty;
  document.getElementById("interview-panel").classList.add("active");

  interviewActive = true;
  roundCount = data.round || 0;
  scores = data.scores || [];
  setStatus("Live Interview", true);

  // Re-render conversation history
  const history = data.history || [];
  for (const msg of history) {
    if (msg.role === "assistant") {
      addMessage("recruiter", msg.content);
    } else if (msg.role === "user") {
      addMessage("candidate", msg.content);
    }
  }

  // Re-render the latest score if available
  if (scores.length > 0) {
    renderScore(scores[scores.length - 1]);
  }

  // Re-render adaptive state
  if (data.adaptive_state) {
    adaptiveState = data.adaptive_state;
    if (data.adaptive_state.action_history && data.adaptive_state.action_history.length > 0) {
      const lastAction = data.adaptive_state.action_history[data.adaptive_state.action_history.length - 1];
      const actionKey = lastAction.split(":")[0];
      updateAdaptiveIndicator({ action: actionKey, reasoning: "" });
    }
  }
}

checkForExistingSession();
