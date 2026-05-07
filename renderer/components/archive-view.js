import { store } from '../store.js';

let overlayEl = null;

export function showArchiveOverlay() {
  const el = document.getElementById('archive-overlay');
  el.classList.remove('hidden');
  // Notify listeners so app.js's render() calls renderArchiveOverlay
  // while the overlay is already visible, filling in its content.
  store._notify();
}

export function renderArchiveOverlay(container, contexts) {
  overlayEl = container;

  const isVisible = !container.classList.contains('hidden');

  container.innerHTML = '';

  if (!isVisible) return;

  const panel = document.createElement('div');
  panel.className = 'archive-panel';

  const header = document.createElement('div');
  header.className = 'archive-header';

  const title = document.createElement('h2');
  title.className = 'archive-title';
  title.textContent = 'Archive';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'archive-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.dataset.tooltip = 'Close';
  closeBtn.addEventListener('click', () => {
    container.classList.add('hidden');
    store._notify(); // re-render to hide
  });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'archive-body';

  // Render each top-level context as a tree
  for (const ctx of contexts) {
    const section = buildContextSection(ctx, true);
    if (section) body.appendChild(section);
  }

  if (body.children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'archive-empty';
    empty.textContent = 'No archived items.';
    body.appendChild(empty);
  }

  panel.appendChild(body);
  container.appendChild(panel);
}

function buildContextSection(ctx, isTopLevel) {
  // Collect archived items at this level
  const archivedObjects = ctx.canvas.objects.filter(o => o.archived);
  const hasArchivedContext = isTopLevel && ctx.archived;

  // Also look for non-archived sub-contexts with archived children
  const subcontextsWithArchived = ctx.canvas.objects
    .filter(o => o.type === 'subcontext' && !o.archived)
    .filter(o => hasArchivedDescendants(o.context));

  if (!hasArchivedContext && archivedObjects.length === 0 && subcontextsWithArchived.length === 0) {
    return null;
  }

  const section = document.createElement('div');
  section.className = 'archive-section';

  // Context header
  const ctxHeader = document.createElement('div');
  ctxHeader.className = 'archive-context-header';

  const ctxName = document.createElement('span');
  ctxName.className = 'archive-context-name';
  ctxName.textContent = ctx.name;
  ctxHeader.appendChild(ctxName);

  if (hasArchivedContext) {
    ctxHeader.classList.add('archive-context-archived');
    const unarchiveBtn = document.createElement('button');
    unarchiveBtn.className = 'archive-action-btn';
    unarchiveBtn.textContent = 'Un-archive context';
    unarchiveBtn.title = 'Restore this context to the tab bar';
    unarchiveBtn.dataset.tooltip = 'Restore this context to the tab bar';
    unarchiveBtn.addEventListener('click', () => store.unarchiveContext(ctx.id));
    ctxHeader.appendChild(unarchiveBtn);
  }

  // Bulk un-archive all immediate children
  if (archivedObjects.length > 0) {
    const bulkBtn = document.createElement('button');
    bulkBtn.className = 'archive-action-btn archive-bulk-btn';
    bulkBtn.textContent = 'Un-archive all children';
    bulkBtn.title = 'Restore all archived items in this context';
    bulkBtn.dataset.tooltip = 'Restore all archived items in this context';
    bulkBtn.addEventListener('click', () => store.unarchiveAllChildren(ctx.id));
    ctxHeader.appendChild(bulkBtn);
  }

  section.appendChild(ctxHeader);

  // Archived objects in this context
  for (const obj of archivedObjects) {
    const item = buildArchivedItem(obj, ctx.id);
    section.appendChild(item);

    // If sub-context, recurse
    if (obj.type === 'subcontext' && obj.context) {
      const sub = buildContextSection(obj.context, false);
      if (sub) {
        sub.classList.add('archive-subsection');
        section.appendChild(sub);
      }
    }
  }

  // Non-archived sub-contexts with archived children
  for (const obj of subcontextsWithArchived) {
    const sub = buildContextSection(obj.context, false);
    if (sub) {
      sub.classList.add('archive-subsection');
      section.appendChild(sub);
    }
  }

  return section;
}

function buildArchivedItem(obj, contextId) {
  const item = document.createElement('div');
  item.className = 'archive-item';

  const icon = document.createElement('span');
  icon.className = 'archive-item-icon';
  icon.textContent = typeIcon(obj.type);
  item.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'archive-item-name';
  name.textContent = obj.label || obj.type;
  item.appendChild(name);

  const badge = document.createElement('span');
  badge.className = 'archive-item-type';
  badge.textContent = obj.type;
  item.appendChild(badge);

  const unarchiveBtn = document.createElement('button');
  unarchiveBtn.className = 'archive-action-btn';
  unarchiveBtn.textContent = 'Un-archive';
  unarchiveBtn.title = 'Restore this item to the canvas';
  unarchiveBtn.dataset.tooltip = 'Restore this item to the canvas';
  unarchiveBtn.addEventListener('click', () => store.unarchiveObject(contextId, obj.id));
  item.appendChild(unarchiveBtn);

  return item;
}

function hasArchivedDescendants(ctx) {
  if (ctx.archived) return true;
  for (const obj of ctx.canvas.objects) {
    if (obj.archived) return true;
    if (obj.type === 'subcontext' && hasArchivedDescendants(obj.context)) return true;
  }
  return false;
}

function typeIcon(type) {
  const icons = {
    website: '🌐', application: '⚙', file: '📁',
    subcontext: '⬡', line: '╱', ellipse: '○',
  };
  return icons[type] || '□';
}
