/**
 * mindmap.js — collapsible concept-tree rendering.
 */

import { escapeHtml } from "./ui.js";

let _nodeId = 0;

export function resetMindmapIds() {
  _nodeId = 0;
}

function nextNodeId() {
  _nodeId += 1;
  return `mm-node-${_nodeId}`;
}

function renderNode(node, depth = 0) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const label = escapeHtml(node.label || "");

  if (!hasChildren) {
    return `<li class="mm-leaf" style="--depth:${depth}">${label}</li>`;
  }

  const id = nextNodeId();
  return `
    <li class="mm-branch" style="--depth:${depth}">
      <button type="button" class="mm-toggle" aria-expanded="false"
              onclick="toggleMindmapBranch(this)" data-target="${id}">
        <span class="mm-chevron" aria-hidden="true">▶</span>
        <span>${label}</span>
      </button>
      <ul id="${id}" class="mm-children" hidden>
        ${node.children.map(child => renderNode(child, depth + 1)).join("")}
      </ul>
    </li>`;
}

export function renderMindmap(tree) {
  const rootLabel = escapeHtml(tree?.label || "Overview");
  const children = Array.isArray(tree?.children) ? tree.children : [];
  return `
    <div class="quick-revision-mindmap">
      <div class="mm-root">${rootLabel}</div>
      <ul class="mm-tree">
        ${children.map(node => renderNode(node, 0)).join("")}
      </ul>
    </div>`;
}

export function toggleMindmapBranch(btn) {
  const ul = document.getElementById(btn.dataset.target);
  if (!ul) return;
  const open = ul.hidden;
  ul.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  const chevron = btn.querySelector(".mm-chevron");
  if (chevron) chevron.textContent = open ? "▼" : "▶";
}
