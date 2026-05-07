import { store } from '../store.js';
import { showContextMenu } from './context-menu.js';
import { showConfirm, showAlert, showPrompt } from './dialogs.js';
import { showArchiveOverlay } from './archive-view.js';

let dragSrcIdx = null;

export function renderTabBar(container, contexts, activeId) {
  container.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'tab-bar';

  // macOS traffic-light spacer
  const spacer = document.createElement('div');
  spacer.className = 'tab-bar-spacer';
  bar.appendChild(spacer);

  const tabs = document.createElement('div');
  tabs.className = 'tab-bar-tabs';

  contexts.filter(c => !c.archived).forEach((ctx, idx) => {
    const tab = buildTab(ctx, ctx.id === activeId, idx);
    tabs.appendChild(tab);
  });

  // Archive toggle button
  const archiveBtn = document.createElement('button');
  archiveBtn.className = 'tab-bar-archive-btn';
  archiveBtn.title = 'View archived items';
  archiveBtn.dataset.tooltip = 'View archived items';
  archiveBtn.textContent = '🗄';
  archiveBtn.addEventListener('click', () => showArchiveOverlay());
  tabs.appendChild(archiveBtn);

  // Add context button
  const addBtn = document.createElement('button');
  addBtn.className = 'tab-bar-add-btn';
  addBtn.title = 'New context';
  addBtn.dataset.tooltip = 'New context';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', async () => {
    const name = await showPrompt('New context', 'Context name');
    if (name) store.addContext(name);
  });
  tabs.appendChild(addBtn);

  bar.appendChild(tabs);
  container.appendChild(bar);
}

function buildTab(ctx, isActive, idx) {
  const tab = document.createElement('div');
  tab.className = 'tab' + (isActive ? ' tab-active' : '');
  tab.draggable = true;
  tab.dataset.idx = idx;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = ctx.name;

  // Double-click to rename
  label.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startInlineRename(ctx, label);
  });

  tab.appendChild(label);

  // Click to activate
  tab.addEventListener('click', () => {
    if (!label.isContentEditable) store.setActiveTab(ctx.id);
  });

  // Right-click context menu
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Archive',
        action: () => archiveContext(ctx),
      },
      {
        label: 'Delete',
        danger: true,
        action: () => deleteContext(ctx),
      },
    ]);
  });

  // Drag to reorder
  tab.addEventListener('dragstart', (e) => {
    dragSrcIdx = idx;
    tab.classList.add('tab-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  tab.addEventListener('dragend', () => {
    tab.classList.remove('tab-dragging');
    dragSrcIdx = null;
  });

  tab.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    tab.classList.add('tab-drag-over');
  });

  tab.addEventListener('dragleave', () => {
    tab.classList.remove('tab-drag-over');
  });

  tab.addEventListener('drop', (e) => {
    e.preventDefault();
    tab.classList.remove('tab-drag-over');
    if (dragSrcIdx !== null && dragSrcIdx !== idx) {
      // Map visible indices to actual indices in contexts array
      const visibleContexts = store.state.contexts.filter(c => !c.archived);
      const fromId = visibleContexts[dragSrcIdx]?.id;
      const toId   = visibleContexts[idx]?.id;
      if (fromId && toId) {
        const allContexts = store.state.contexts;
        const fromActualIdx = allContexts.findIndex(c => c.id === fromId);
        const toActualIdx   = allContexts.findIndex(c => c.id === toId);
        store.reorderContexts(fromActualIdx, toActualIdx);
      }
    }
  });

  return tab;
}

function startInlineRename(ctx, labelEl) {
  labelEl.contentEditable = 'true';
  labelEl.focus();
  // Select all text
  const range = document.createRange();
  range.selectNodeContents(labelEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function commit() {
    labelEl.contentEditable = 'false';
    const newName = labelEl.textContent.trim();
    if (newName) store.renameContext(ctx.id, newName);
    else labelEl.textContent = ctx.name;
  }

  labelEl.addEventListener('blur', commit, { once: true });
  labelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); labelEl.blur(); }
    if (e.key === 'Escape') {
      labelEl.textContent = ctx.name;
      labelEl.contentEditable = 'false';
    }
  }, { once: false });
}

async function archiveContext(ctx) {
  if (!store.canArchiveOrDeleteContext(ctx)) {
    showAlert('Cannot archive', 'All direct child objects must be archived first.');
    return;
  }
  const ok = await showConfirm('Archive context', `Archive "${ctx.name}"? It will be hidden from the tab bar.`);
  if (ok) store.archiveContext(ctx.id);
}

async function deleteContext(ctx) {
  if (!store.canArchiveOrDeleteContext(ctx)) {
    showAlert('Cannot delete', 'All direct child objects must be archived or deleted first.');
    return;
  }
  const ok = await showConfirm('Delete context', `Delete "${ctx.name}"? This cannot be undone.`);
  if (ok) store.deleteContext(ctx.id);
}
