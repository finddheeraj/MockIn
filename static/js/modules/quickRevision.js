/**
 * quickRevision.js — Quick Revision modal (topics, mind map, Q&A).
 */

import {
  apiGetQuickRevisionTopics,
  apiGetQuickRevisionSubtopics,
  apiGetQuickRevisionQuestions,
  apiGetQuickRevisionMindmap,
} from "./api.js";
import { escapeHtml, showToast } from "./ui.js";
import { renderPreviewAnswer } from "./previewAnswer.js";
import { renderMindmap, resetMindmapIds, toggleMindmapBranch } from "./mindmap.js";

export { toggleMindmapBranch };

const IDS = {
  overlay: "quick-revision-modal-overlay",
  content: "quick-revision-preview",
  topicSelect: "quick-topic-select",
  subtopicSelect: "quick-subtopic-select",
  fetchBtn: "btn-fetch-quick-revision",
  results: "quick-revision-results",
  mindmap: "quick-revision-mindmap",
  questions: "quick-revision-questions",
};

let _topicsLoaded = false;
let _subtopicsByTopic = {};

function el(id) {
  return document.getElementById(id);
}

function renderModalShell() {
  return `
    <div class="qs-header">
      <div class="qs-header-left">
        <span class="qs-title">Quick Revision</span>
        <span class="qs-meta">Predefined questions for quick revision</span>
      </div>
      <button class="qs-close" onclick="closeQuickRevision()">×</button>
    </div>
    <div class="quick-revision-controls">
      <div class="select-wrap">
        <select id="${IDS.topicSelect}" onchange="updateQuickRevisionSubtopics()">
          <option value="">Loading topics...</option>
        </select>
      </div>
      <div class="select-wrap">
        <select id="${IDS.subtopicSelect}" onchange="onQuickRevisionSubtopicChange()">
          <option value="">Select subtopic</option>
        </select>
      </div>
      <button class="btn-load-more" id="${IDS.fetchBtn}" onclick="fetchQuickRevisionQuestions()">
        Fetch Questions
      </button>
    </div>
    <div id="${IDS.results}" class="quick-revision-results">
      <div class="quick-revision-mindmap-section">
        <div class="quick-revision-mindmap-heading">Concept map</div>
        <div id="${IDS.mindmap}">
          <div class="qs-loading">Select a topic and subtopic to view the mind map.</div>
        </div>
      </div>
      <div id="${IDS.questions}" class="quick-revision-questions-section"></div>
    </div>`;
}

function renderQuestions(questions) {
  if (!questions?.length) {
    return '<div class="qs-error">No quick revision questions found for this topic.</div>';
  }

  return questions.map((item, i) => `
    <div class="qs-qa-item">
      <div class="qs-question" onclick="toggleQAItem(this)">
        <span class="qs-q-num">${i + 1}.</span>
        <span class="qs-q-text">${escapeHtml(item.question || "")}</span>
        <svg class="qs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="qs-answer">
        <div class="qs-answer-text">${renderPreviewAnswer(item.answer || "")}</div>
      </div>
    </div>
  `).join("");
}

async function loadTopics() {
  const select = el(IDS.topicSelect);
  if (!select || _topicsLoaded) return;

  const data = await apiGetQuickRevisionTopics();
  const topics = data.topics || [];
  select.innerHTML = topics
    .map(topic => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)
    .join("");

  const currentTopic = el("topic-select")?.value;
  if (currentTopic && topics.includes(currentTopic)) {
    select.value = currentTopic;
  }

  _topicsLoaded = true;
}

async function loadSubtopics(topic) {
  const select = el(IDS.subtopicSelect);
  if (!select || !topic) return;

  if (!_subtopicsByTopic[topic]) {
    const data = await apiGetQuickRevisionSubtopics(topic);
    if (data.error) throw new Error(data.error);
    _subtopicsByTopic[topic] = data.subtopics || [];
  }

  const subtopics = _subtopicsByTopic[topic];
  select.innerHTML = subtopics
    .map(subtopic => `<option value="${escapeHtml(subtopic)}">${escapeHtml(subtopic)}</option>`)
    .join("");
}

async function loadMindmap(topic, subtopic) {
  const container = el(IDS.mindmap);
  if (!container || !topic || !subtopic) return;

  container.innerHTML = '<div class="qs-loading">Loading mind map...</div>';
  try {
    const data = await apiGetQuickRevisionMindmap(topic, subtopic);
    if (data.error) {
      container.innerHTML = '<div class="qs-meta">No mind map available for this subtopic.</div>';
      return;
    }
    resetMindmapIds();
    container.innerHTML = renderMindmap(data.mindmap || {});
  } catch (err) {
    console.error("quick revision mindmap error:", err);
    container.innerHTML = '<div class="qs-error">Failed to load mind map.</div>';
  }
}

function selectedTopic() {
  return el(IDS.topicSelect)?.value;
}

function selectedSubtopic() {
  return el(IDS.subtopicSelect)?.value;
}

export async function onQuickRevisionSubtopicChange() {
  const questions = el(IDS.questions);
  if (questions) questions.innerHTML = "";
  await loadMindmap(selectedTopic(), selectedSubtopic());
}

export async function updateQuickRevisionSubtopics() {
  const topic = selectedTopic();
  const results = el(IDS.results);

  try {
    await loadSubtopics(topic);
    await onQuickRevisionSubtopicChange();
  } catch (err) {
    console.error("quick revision subtopics error:", err);
    if (results) results.innerHTML = '<div class="qs-error">Failed to load subtopics.</div>';
  }
}

export async function openQuickRevision() {
  const overlay = el(IDS.overlay);
  const content = el(IDS.content);
  if (!overlay || !content) return;

  _topicsLoaded = false;
  resetMindmapIds();

  overlay.style.display = "flex";
  overlay.onclick = (e) => {
    if (e.target === overlay) closeQuickRevision();
  };

  content.innerHTML = renderModalShell();

  try {
    await loadTopics();
    await updateQuickRevisionSubtopics();
  } catch (err) {
    console.error("quick revision topics error:", err);
    const results = el(IDS.results);
    if (results) results.innerHTML = '<div class="qs-error">Failed to load topics.</div>';
  }
}

export async function fetchQuickRevisionQuestions() {
  const topic = selectedTopic();
  const subtopic = selectedSubtopic();
  const questionsEl = el(IDS.questions);
  const btn = el(IDS.fetchBtn);

  if (!topic || !subtopic) {
    showToast("Choose a topic and subtopic first.");
    return;
  }

  if (!questionsEl) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Fetching...";
  }
  questionsEl.innerHTML = '<div class="qs-loading">Loading questions...</div>';

  try {
    const data = await apiGetQuickRevisionQuestions(topic, subtopic);
    if (data.error) {
      questionsEl.innerHTML = `<div class="qs-error">${escapeHtml(data.error)}</div>`;
      return;
    }

    questionsEl.innerHTML = `
      <div class="qs-header quick-revision-result-header">
        <div class="qs-header-left">
          <span class="qs-title">${escapeHtml(data.topic || topic)}</span>
          <span class="qs-meta">${escapeHtml(data.subtopic || subtopic)} • ${(data.questions || []).length} quick revision questions</span>
        </div>
      </div>
      <div>${renderQuestions(data.questions || [])}</div>
    `;
  } catch (err) {
    console.error("quick revision questions error:", err);
    questionsEl.innerHTML = '<div class="qs-error">Failed to fetch quick revision questions.</div>';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Fetch Questions";
    }
  }
}

export function closeQuickRevision() {
  const overlay = el(IDS.overlay);
  if (overlay) overlay.style.display = "none";
}
