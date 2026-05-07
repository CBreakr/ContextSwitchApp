import { store } from '../store.js';
import {
  worldToVP, vpToWorld, zoomViewport, fitToScreen,
  resolveEndpoint, resolveEllipseCenter, resolveNoteAnchor,
  isRectInsideEllipse, collectMoveTargets, objectBoundingBox,
  svgEl, uuid,
} from '../utils.js';
import { showContextMenu, hideContextMenu } from './context-menu.js';
import {
  showConfirm, showAlert, showObjectPropertiesDialog,
  showNoteEditorDialog, showSaveTemplateDialog,
  showWebsiteDialog, showApplicationDialog, showFileDialog, showSubContextDialog,
} from './dialogs.js';

// ── Canvas state (per render session) ─────────────────────────────────────
let vpEl   = null;   // canvas-viewport div
let worldEl = null;  // canvas-world div
let svgEl_ = null;   // canvas-svg SVG element

let currentContextId = null;
let currentVp = { scale: 1, offsetX: 40, offsetY: 40 };

// Edit mode state
let lineEditId   = null;
let ellipseEditId = null;

// Drag state
let dragState = null;
// Raised by startObjectDrag as soon as the pointer moves; cleared by click handler.
let dragMoved = false;

// ── Entry point ───────────────────────────────────────────────────────────

export function renderCanvas(container, ctx) {
  if (!ctx) {
    container.innerHTML = '<div class="canvas-empty">No context selected</div>';
    return;
  }

  const contextChanged = ctx.id !== currentContextId;
  if (contextChanged) { lineEditId = null; ellipseEditId = null; }
  currentContextId = ctx.id;

  if (!vpEl || contextChanged || !container.contains(vpEl)) {
    buildCanvasDom(container);
  }

  currentVp = ctx.canvas.viewport;

  applyViewport();
  renderObjects(ctx);
  renderSvgLayer(ctx);
  renderNotes(ctx);
}

function buildCanvasDom(container) {
  container.innerHTML = '';

  vpEl = document.createElement('div');
  vpEl.className = 'canvas-viewport';

  worldEl = document.createElement('div');
  worldEl.className = 'canvas-world';
  vpEl.appendChild(worldEl);

  svgEl_ = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl_.setAttribute('class', 'canvas-svg');
  svgEl_.style.pointerEvents = 'none';
  vpEl.appendChild(svgEl_);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'canvas-toolbar';

  const fitBtn = document.createElement('button');
  fitBtn.className = 'canvas-toolbar-btn';
  fitBtn.title = 'Fit to screen';
  fitBtn.dataset.tooltip = 'Fit to screen';
  fitBtn.textContent = '⊞';
  fitBtn.addEventListener('click', fitToScreenAction);
  toolbar.appendChild(fitBtn);

  vpEl.appendChild(toolbar);

  // Events
  vpEl.addEventListener('wheel',     onWheel,     { passive: false });
  vpEl.addEventListener('mousedown',  onVpMouseDown);
  vpEl.addEventListener('contextmenu', (e) => e.preventDefault());

  container.appendChild(vpEl);
}

function applyViewport() {
  if (!worldEl) return;
  worldEl.style.transformOrigin = '0 0';
  worldEl.style.transform =
    `translate(${currentVp.offsetX}px, ${currentVp.offsetY}px) scale(${currentVp.scale})`;
}

// ── Object rendering ───────────────────────────────────────────────────────

function renderObjects(ctx) {
  // Remove stale object divs
  const existingIds = new Set([...worldEl.querySelectorAll('.canvas-object')].map(el => el.dataset.id));
  const currentIds  = new Set(ctx.canvas.objects.filter(o => !o.archived && o.type !== 'line' && o.type !== 'ellipse').map(o => o.id));

  existingIds.forEach(id => {
    if (!currentIds.has(id)) worldEl.querySelector(`.canvas-object[data-id="${id}"]`)?.remove();
  });

  for (const obj of ctx.canvas.objects) {
    if (obj.archived) continue;
    if (obj.type === 'line' || obj.type === 'ellipse') continue;
    upsertObjectEl(obj, ctx);
  }
}

function upsertObjectEl(obj, ctx) {
  let el = worldEl.querySelector(`.canvas-object[data-id="${obj.id}"]`);
  const isNew = !el;

  if (isNew) {
    el = document.createElement('div');
    el.className = 'canvas-object';
    el.dataset.id = obj.id;
    el.dataset.type = obj.type;
    worldEl.appendChild(el);
    attachObjectEvents(el, obj, ctx);
  }

  // Position & size
  el.style.left   = obj.x + 'px';
  el.style.top    = obj.y + 'px';
  el.style.width  = obj.width + 'px';
  el.style.height = obj.height + 'px';

  // Content
  el.innerHTML = '';
  el.classList.remove('canvas-object-website', 'canvas-object-application',
    'canvas-object-file', 'canvas-object-subcontext');
  el.classList.add('canvas-object-' + obj.type);

  buildObjectContent(el, obj);

  // Resize handles
  attachResizeHandles(el, obj, ctx);
}

function buildObjectContent(el, obj) {
  const label = document.createElement('div');
  label.className = 'canvas-object-label';
  label.textContent = obj.label;
  el.appendChild(label);

  if (obj.image) {
    const img = document.createElement('img');
    img.className = 'canvas-object-image';
    img.src = obj.image;
    img.draggable = false;
    el.appendChild(img);
  } else if (obj.type === 'application' || obj.type === 'file') {
    // Will load icon async after append
    const iconEl = document.createElement('div');
    iconEl.className = 'canvas-object-icon-placeholder';
    el.appendChild(iconEl);
    loadIcon(obj, iconEl);
  } else if (obj.type === 'subcontext') {
    el.classList.add('canvas-object-subcontext-frame');
  }
}

async function loadIcon(obj, container) {
  const p = obj.type === 'application' ? obj.bundlePath : obj.path;
  if (!p) return;
  const dataUrl = await window.api.file.icon(p);
  if (dataUrl && container.isConnected) {
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.className = 'canvas-object-icon';
    img.draggable = false;
    container.appendChild(img);
  }
}

// ── Object events ──────────────────────────────────────────────────────────

function attachObjectEvents(el, obj, ctx) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.classList.contains('resize-handle')) return;
    e.stopPropagation();
    startObjectDrag(e, obj, ctx);
  });

  el.addEventListener('click', () => {
    if (dragMoved) { dragMoved = false; return; }
    handleObjectClick(obj, ctx);
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showObjectContextMenu(e.clientX, e.clientY, obj, ctx);
  });
}

function handleObjectClick(obj, ctx) {
  switch (obj.type) {
    case 'website':     window.api.url.open(obj.url); break;
    case 'application': window.api.app.launch(obj.bundlePath); break;
    case 'file':        window.api.file.open(obj.path, obj.defaultApp); break;
    case 'subcontext':  store.navigateInto(obj.context.id); break;
  }
}

function showObjectContextMenu(x, y, obj, ctx) {
  const items = [
    {
      label: 'Edit properties',
      action: async () => {
        const updates = await showObjectPropertiesDialog(obj);
        if (updates) store.updateObject(obj.id, updates);
      },
    },
    {
      label: `Notes (${(ctx.canvas.notes.filter(n => n.anchor?.objectId === obj.id)).length})`,
      action: () => addNoteToObject(obj, ctx),
    },
    { separator: true },
    {
      label: 'Archive',
      action: async () => {
        if (obj.type === 'subcontext' && !store.canArchiveOrDeleteContext(obj.context)) {
          showAlert('Cannot archive', 'All direct child objects must be archived first.');
          return;
        }
        const ok = await showConfirm('Archive object', `Archive "${obj.label}"?`);
        if (ok) store.archiveObject(currentContextId, obj.id);
      },
    },
    {
      label: 'Delete',
      danger: true,
      action: async () => {
        if (obj.type === 'subcontext' && !store.canArchiveOrDeleteContext(obj.context)) {
          showAlert('Cannot delete', 'All direct child objects must be archived first.');
          return;
        }
        const ok = await showConfirm('Delete object', `Delete "${obj.label}"? This cannot be undone.`);
        if (ok) store.deleteObject(currentContextId, obj.id);
      },
    },
  ];

  if (obj.type === 'line' || obj.type === 'ellipse') {
    items.unshift({ label: 'Edit', action: () => enterEditMode(obj) });
  }

  showContextMenu(x, y, items);
}

function addNoteToObject(obj, ctx) {
  // Add a plain text note anchored to top-left corner of obj
  const note = {
    id: uuid(),
    format: 'plaintext',
    content: '',
    css: '',
    anchor: { type: 'object', objectId: obj.id, corner: 'top-right' },
    x: 8,
    y: 0,
    width: 200,
    height: 80,
  };
  store.addNote(note);
}

// ── Drag objects ───────────────────────────────────────────────────────────

function startObjectDrag(e, obj, ctx) {
  const startX = e.clientX;
  const startY = e.clientY;
  const origX  = obj.type === 'ellipse' ? (obj.center?.x ?? 0) : obj.x;
  const origY  = obj.type === 'ellipse' ? (obj.center?.y ?? 0) : obj.y;

  // Collect objects to move together (ellipse containedIds)
  let moveSet = null;
  if (obj.type === 'ellipse') {
    moveSet = collectMoveTargets(obj.id, ctx.canvas.objects);
    moveSet.add(obj.id);
  }

  dragState = { type: 'object', obj, origX, origY, startX, startY, moveSet };

  let dropTargetId = null; // sub-context we're hovering over as a drop target

  function clearDropTarget() {
    if (dropTargetId) {
      worldEl.querySelector(`.canvas-object[data-id="${dropTargetId}"]`)
        ?.classList.remove('canvas-object-drop-target');
      dropTargetId = null;
    }
  }

  function updateDropTarget(e2) {
    // Don't allow dropping sub-contexts into sub-contexts to keep things simple
    if (obj.type === 'ellipse' || obj.type === 'line') return;

    const vpRect = vpEl.getBoundingClientRect();
    const worldX = (e2.clientX - vpRect.left - currentVp.offsetX) / currentVp.scale;
    const worldY = (e2.clientY - vpRect.top  - currentVp.offsetY) / currentVp.scale;

    let newTarget = null;
    for (const candidate of ctx.canvas.objects) {
      if (candidate.archived) continue;
      if (candidate.type !== 'subcontext') continue;
      if (candidate.id === obj.id) continue;
      if (worldX >= candidate.x && worldX <= candidate.x + candidate.width &&
          worldY >= candidate.y && worldY <= candidate.y + candidate.height) {
        newTarget = candidate.id;
        break;
      }
    }

    if (newTarget !== dropTargetId) {
      clearDropTarget();
      if (newTarget) {
        worldEl.querySelector(`.canvas-object[data-id="${newTarget}"]`)
          ?.classList.add('canvas-object-drop-target');
        dropTargetId = newTarget;
      }
    }
  }

  const onMove = (e2) => {
    if (!dragState || dragState.type !== 'object') return;
    const dx = (e2.clientX - startX) / currentVp.scale;
    const dy = (e2.clientY - startY) / currentVp.scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;

    if (moveSet) {
      for (const id of moveSet) {
        const target = ctx.canvas.objects.find(o => o.id === id);
        if (!target) continue;
        if (target.type !== 'ellipse') {
          const el = worldEl.querySelector(`.canvas-object[data-id="${id}"]`);
          if (el) {
            const startObjX = ctx.canvas.objects.find(o => o.id === id)?.x ?? 0;
            const startObjY = ctx.canvas.objects.find(o => o.id === id)?.y ?? 0;
            el.style.left = (startObjX + dx) + 'px';
            el.style.top  = (startObjY + dy) + 'px';
          }
        }
      }
    } else {
      const el = worldEl.querySelector(`.canvas-object[data-id="${obj.id}"]`);
      if (el) {
        el.style.left = (origX + dx) + 'px';
        el.style.top  = (origY + dy) + 'px';
      }
    }
    updateSvgLayerDuringDrag(ctx, obj.id, moveSet, dx, dy);
    updateDropTarget(e2);
  };

  const onUp = (e2) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    const finalDropTarget = dropTargetId; // capture before clearDropTarget() nulls it
    clearDropTarget();

    if (!dragState) return;
    const dx = (e2.clientX - startX) / currentVp.scale;
    const dy = (e2.clientY - startY) / currentVp.scale;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { dragState = null; return; }

    if (finalDropTarget) {
      const subCtxObj = ctx.canvas.objects.find(o => o.id === finalDropTarget);
      const subVp = subCtxObj?.context.canvas.viewport ?? { scale: 1, offsetX: 0, offsetY: 0 };
      const vpRect = vpEl.getBoundingClientRect();
      const newX = Math.max(0, (vpRect.width  / 2 - subVp.offsetX) / subVp.scale);
      const newY = Math.max(0, (vpRect.height / 2 - subVp.offsetY) / subVp.scale);
      store.transferObject(currentContextId, obj.id, finalDropTarget, newX, newY);
    } else if (moveSet) {
      store.moveObjects(currentContextId, moveSet, dx, dy);
    } else {
      store.updateObject(obj.id, {
        x: Math.max(0, origX + dx),
        y: Math.max(0, origY + dy),
      });
    }
    dragState = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function updateSvgLayerDuringDrag(ctx, movedId, moveSet, dx, dy) {
  // Re-render SVG lines/ellipses with temporary positions
  const objects = ctx.canvas.objects.map(o => {
    if (!moveSet || !moveSet.has(o.id)) return o;
    if (o.type === 'ellipse') {
      const ep = o.center;
      if (ep.type === 'canvas') {
        return { ...o, center: { ...ep, x: ep.x + dx, y: ep.y + dy } };
      }
      return o;
    }
    return { ...o, x: (o.x || 0) + dx, y: (o.y || 0) + dy };
  });
  renderSvgLayerWithObjects(objects, ctx.canvas.notes);
}

// ── Resize handles ─────────────────────────────────────────────────────────

function attachResizeHandles(el, obj, ctx) {
  // Remove old handles
  el.querySelectorAll('.resize-handle').forEach(h => h.remove());

  const positions = ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'];
  for (const pos of positions) {
    const handle = document.createElement('div');
    handle.className = `resize-handle resize-handle-${pos}`;
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startResize(e, obj, pos, ctx);
    });
    el.appendChild(handle);
  }
}

function startResize(e, obj, pos, ctx) {
  const startX = e.clientX;
  const startY = e.clientY;
  const origX = obj.x, origY = obj.y, origW = obj.width, origH = obj.height;

  const onMove = (e2) => {
    const dx = (e2.clientX - startX) / currentVp.scale;
    const dy = (e2.clientY - startY) / currentVp.scale;

    let nx = origX, ny = origY, nw = origW, nh = origH;

    if (pos.includes('e')) nw = Math.max(1, origW + dx);
    if (pos.includes('s')) nh = Math.max(1, origH + dy);
    if (pos.includes('w')) { nx = origX + dx; nw = Math.max(1, origW - dx); }
    if (pos.includes('n')) { ny = origY + dy; nh = Math.max(1, origH - dy); }

    const el = worldEl.querySelector(`.canvas-object[data-id="${obj.id}"]`);
    if (el) {
      el.style.left   = nx + 'px';
      el.style.top    = ny + 'px';
      el.style.width  = nw + 'px';
      el.style.height = nh + 'px';
    }
  };

  const onUp = (e2) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    const dx = (e2.clientX - startX) / currentVp.scale;
    const dy = (e2.clientY - startY) / currentVp.scale;

    let nx = origX, ny = origY, nw = origW, nh = origH;
    if (pos.includes('e')) nw = Math.max(1, origW + dx);
    if (pos.includes('s')) nh = Math.max(1, origH + dy);
    if (pos.includes('w')) { nx = origX + dx; nw = Math.max(1, origW - dx); }
    if (pos.includes('n')) { ny = origY + dy; nh = Math.max(1, origH - dy); }

    store.updateObject(obj.id, { x: nx, y: ny, width: nw, height: nh });
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── SVG layer (lines + ellipses) ────────────────────────────────────────────

function renderSvgLayer(ctx) {
  renderSvgLayerWithObjects(ctx.canvas.objects, ctx.canvas.notes);
}

function renderSvgLayerWithObjects(objects, notes) {
  if (!svgEl_ || !vpEl) return;

  const rect = vpEl.getBoundingClientRect();
  svgEl_.setAttribute('width', rect.width);
  svgEl_.setAttribute('height', rect.height);

  svgEl_.innerHTML = '';

  // Defs for arrowheads if needed
  const defs = svgEl('defs');
  svgEl_.appendChild(defs);

  const visibleObjects = objects.filter(o => !o.archived);

  for (const obj of visibleObjects) {
    if (obj.type === 'line') {
      renderSvgLine(obj, visibleObjects);
    }
    if (obj.type === 'ellipse') {
      renderSvgEllipse(obj, visibleObjects);
    }
  }

  // Edit mode overlays
  if (lineEditId) {
    const line = objects.find(o => o.id === lineEditId);
    if (line) renderLineEditHandles(line, visibleObjects);
  }
  if (ellipseEditId) {
    const ellipse = objects.find(o => o.id === ellipseEditId);
    if (ellipse) renderEllipseEditHandles(ellipse, visibleObjects);
  }
}

function renderSvgLine(obj, allObjects) {
  // Check if either endpoint is anchored to an archived object
  if (isEndpointArchived(obj.start, allObjects)) return;
  if (isEndpointArchived(obj.end, allObjects))   return;

  const p1 = worldToVP(
    ...(resolveEndpointWithObjects(obj.start, allObjects)),
    currentVp
  );
  const p2 = worldToVP(
    ...(resolveEndpointWithObjects(obj.end, allObjects)),
    currentVp
  );

  const line = svgEl('line', {
    x1: p1.x, y1: p1.y,
    x2: p2.x, y2: p2.y,
    class: 'canvas-line',
    'data-id': obj.id,
  });

  line.style.pointerEvents = 'stroke';
  line.addEventListener('click', () => enterEditMode(obj));
  line.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showSvgObjectContextMenu(e.clientX, e.clientY, obj);
  });

  svgEl_.appendChild(line);
}

function renderSvgEllipse(obj, allObjects) {
  if (isEndpointArchived(obj.center, allObjects)) return;

  const center = resolveEllipseCenter(obj, allObjects);
  const cp     = worldToVP(center.x, center.y, currentVp);
  const rx     = (obj.width  / 2) * currentVp.scale;
  const ry     = (obj.height / 2) * currentVp.scale;

  const ellipseEl = svgEl('ellipse', {
    cx: cp.x, cy: cp.y,
    rx, ry,
    class: 'canvas-ellipse',
    'data-id': obj.id,
  });

  ellipseEl.style.pointerEvents = 'stroke';
  ellipseEl.addEventListener('click', () => enterEditMode(obj));
  ellipseEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showSvgObjectContextMenu(e.clientX, e.clientY, obj);
  });

  svgEl_.appendChild(ellipseEl);
}

function resolveEndpointWithObjects(ep, objects) {
  if (ep.type === 'canvas') return [ep.x, ep.y];
  const obj = objects.find(o => o.id === ep.objectId);
  if (!obj) return [ep.x ?? 0, ep.y ?? 0];
  if (obj.type === 'ellipse') {
    const c = resolveEllipseCenter(obj, objects);
    return [c.x, c.y];
  }
  return [obj.x + obj.width / 2, obj.y + obj.height / 2];
}

function isEndpointArchived(ep, objects) {
  if (!ep || ep.type !== 'anchored') return false;
  const obj = objects.find(o => o.id === ep.objectId);
  return obj?.archived === true;
}

function showSvgObjectContextMenu(x, y, obj) {
  showContextMenu(x, y, [
    { label: 'Edit', action: () => enterEditMode(obj) },
    { separator: true },
    {
      label: 'Delete',
      danger: true,
      action: async () => {
        const ok = await showConfirm('Delete', `Delete this ${obj.type}?`);
        if (ok) store.deleteObject(currentContextId, obj.id);
      },
    },
  ]);
}

// ── Line / Ellipse edit mode ────────────────────────────────────────────────

function enterEditMode(obj) {
  if (obj.type === 'line')    { lineEditId = obj.id;    ellipseEditId = null; }
  if (obj.type === 'ellipse') { ellipseEditId = obj.id; lineEditId    = null; }
  const ctx = store.currentContext;
  if (ctx) renderSvgLayer(ctx);
}

function exitEditMode() {
  const wasEllipse = ellipseEditId;
  lineEditId    = null;
  ellipseEditId = null;
  const ctx = store.currentContext;
  if (ctx) {
    if (wasEllipse) finalizeEllipseContainment(wasEllipse, ctx);
    renderSvgLayer(ctx);
  }
}

function finalizeEllipseContainment(ellipseId, ctx) {
  const ellipse = ctx.canvas.objects.find(o => o.id === ellipseId);
  if (!ellipse) return;

  const center = resolveEllipseCenter(ellipse, ctx.canvas.objects);
  const rx = ellipse.width  / 2;
  const ry = ellipse.height / 2;

  const contained = [];
  for (const obj of ctx.canvas.objects) {
    if (obj.id === ellipseId || obj.type === 'line' || obj.type === 'ellipse') continue;
    if (obj.archived) {
      // Archived objects retain membership if already contained
      if ((ellipse.containedIds || []).includes(obj.id)) contained.push(obj.id);
      continue;
    }
    const box = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
    if (isRectInsideEllipse(box, center.x, center.y, rx, ry)) {
      contained.push(obj.id);
    }
  }

  store.updateObject(ellipseId, { containedIds: contained });
}

function renderLineEditHandles(line, allObjects) {
  const ctx = store.currentContext;
  if (!ctx) return;

  const p1 = resolveEndpointWorld(line.start, allObjects);
  const p2 = resolveEndpointWorld(line.end,   allObjects);
  const s1 = worldToVP(p1.x, p1.y, currentVp);
  const s2 = worldToVP(p2.x, p2.y, currentVp);

  // Draw line in edit style
  const lineEl = svgEl('line', {
    x1: s1.x, y1: s1.y,
    x2: s2.x, y2: s2.y,
    class: 'canvas-line canvas-line-editing',
  });
  svgEl_.appendChild(lineEl);

  // Endpoint handles
  makeEndpointHandle(s1, 'start', line, allObjects, ctx);
  makeEndpointHandle(s2, 'end',   line, allObjects, ctx);

  // Exit on escape
  if (!svgEl_._escListener) {
    svgEl_._escListener = (e) => {
      if (e.key === 'Escape') exitEditMode();
    };
    document.addEventListener('keydown', svgEl_._escListener);
  }
}

function resolveEndpointWorld(ep, objects) {
  const [x, y] = resolveEndpointWithObjects(ep, objects);
  return { x, y };
}

function makeEndpointHandle(screenPos, which, line, allObjects, ctx) {
  const handle = svgEl('circle', {
    cx: screenPos.x, cy: screenPos.y,
    r: 6,
    class: 'canvas-endpoint-handle',
  });
  handle.style.pointerEvents = 'all';
  handle.style.cursor = 'crosshair';

  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    dragLineEndpoint(e, which, line, allObjects, ctx);
  });

  svgEl_.appendChild(handle);
}

function dragLineEndpoint(startEv, which, line, allObjects, ctx) {
  const onMove = (e) => {
    const vp = vpEl.getBoundingClientRect();
    const vpX = e.clientX - vp.left;
    const vpY = e.clientY - vp.top;
    const sx = worldToVP(0, 0, currentVp).x; // unused
    // Update handle position visually
    const handle = svgEl_.querySelector(`.canvas-endpoint-handle:${which === 'start' ? 'first-of-type' : 'last-of-type'}`);
    // Re-render SVG with temp position
    const tempObjects = allObjects.map(o => {
      if (o.id !== line.id) return o;
      const ep = { type: 'canvas', x: vpToWorld(vpX, vpY, currentVp).x, y: vpToWorld(vpX, vpY, currentVp).y };
      return which === 'start' ? { ...o, start: ep } : { ...o, end: ep };
    });
    renderSvgLayerWithObjects(tempObjects, ctx.canvas.notes);
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);

    const vp = vpEl.getBoundingClientRect();
    const vpX = e.clientX - vp.left;
    const vpY = e.clientY - vp.top;
    const worldPos = vpToWorld(vpX, vpY, currentVp);

    // Check if we released over an object (anchor)
    let ep;
    const hitObj = findObjectAtVpPos(vpX, vpY, allObjects);
    if (hitObj && hitObj.id !== line.id) {
      ep = { type: 'anchored', objectId: hitObj.id };
    } else {
      ep = { type: 'canvas', x: worldPos.x, y: worldPos.y };
    }

    const updates = which === 'start' ? { start: ep } : { end: ep };
    store.updateObject(line.id, updates);
    // Re-enter edit mode after update
    lineEditId = line.id;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

function renderEllipseEditHandles(ellipse, allObjects) {
  const ctx = store.currentContext;
  if (!ctx) return;

  const center = resolveEllipseCenter(ellipse, allObjects);
  const cp = worldToVP(center.x, center.y, currentVp);
  const rx = (ellipse.width  / 2) * currentVp.scale;
  const ry = (ellipse.height / 2) * currentVp.scale;

  // Draw ellipse in edit style
  const ellipseEl = svgEl('ellipse', {
    cx: cp.x, cy: cp.y, rx, ry,
    class: 'canvas-ellipse canvas-ellipse-editing',
  });
  svgEl_.appendChild(ellipseEl);

  // Highlight potential containment
  for (const obj of allObjects) {
    if (obj.id === ellipse.id || obj.type === 'line' || obj.type === 'ellipse' || obj.archived) continue;
    const box = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
    if (isRectInsideEllipse(box, center.x, center.y, ellipse.width / 2, ellipse.height / 2)) {
      const domEl = worldEl.querySelector(`.canvas-object[data-id="${obj.id}"]`);
      if (domEl) domEl.classList.add('canvas-object-ellipse-highlight');
    } else {
      const domEl = worldEl.querySelector(`.canvas-object[data-id="${obj.id}"]`);
      if (domEl) domEl.classList.remove('canvas-object-ellipse-highlight');
    }
  }

  // Center handle
  const centerHandle = svgEl('circle', { cx: cp.x, cy: cp.y, r: 7, class: 'canvas-endpoint-handle' });
  centerHandle.style.pointerEvents = 'all';
  centerHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    dragEllipseCenter(e, ellipse, allObjects, ctx);
  });
  svgEl_.appendChild(centerHandle);

  // Edge handles: N, S, E, W
  const edgeHandles = [
    { id: 'n', cx: cp.x,      cy: cp.y - ry },
    { id: 's', cx: cp.x,      cy: cp.y + ry },
    { id: 'e', cx: cp.x + rx, cy: cp.y      },
    { id: 'w', cx: cp.x - rx, cy: cp.y      },
  ];
  for (const eh of edgeHandles) {
    const h = svgEl('circle', { cx: eh.cx, cy: eh.cy, r: 5, class: 'canvas-edge-handle' });
    h.style.pointerEvents = 'all';
    h.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      dragEllipseEdge(e, ellipse, eh.id, ctx);
    });
    svgEl_.appendChild(h);
  }

  // Exit on escape or click-outside
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { document.removeEventListener('keydown', esc); exitEditMode(); }
  });
}

function dragEllipseCenter(startEv, ellipse, allObjects, ctx) {
  const startVp = { x: startEv.clientX, y: startEv.clientY };
  const origCenter = resolveEllipseCenter(ellipse, allObjects);
  const moveSet = collectMoveTargets(ellipse.id, ctx.canvas.objects);
  moveSet.add(ellipse.id);

  const onMove = (e) => {
    const dx = (e.clientX - startVp.x) / currentVp.scale;
    const dy = (e.clientY - startVp.y) / currentVp.scale;
    const tempObjects = ctx.canvas.objects.map(o => {
      if (!moveSet.has(o.id)) return o;
      if (o.type === 'ellipse' && o.center.type === 'canvas') {
        return { ...o, center: { type: 'canvas', x: o.center.x + dx, y: o.center.y + dy } };
      }
      return { ...o, x: (o.x || 0) + dx, y: (o.y || 0) + dy };
    });
    renderSvgLayerWithObjects(tempObjects, ctx.canvas.notes);
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    const dx = (e.clientX - startVp.x) / currentVp.scale;
    const dy = (e.clientY - startVp.y) / currentVp.scale;

    // Check anchor
    const vp = vpEl.getBoundingClientRect();
    const vpX = e.clientX - vp.left;
    const vpY = e.clientY - vp.top;
    const hitObj = findObjectAtVpPos(vpX, vpY, allObjects.filter(o => o.id !== ellipse.id));

    if (hitObj) {
      store.updateObject(ellipse.id, { center: { type: 'anchored', objectId: hitObj.id } });
    } else {
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        store.moveObjects(currentContextId, moveSet, dx, dy);
      }
    }
    ellipseEditId = ellipse.id;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

function dragEllipseEdge(startEv, ellipse, edge, ctx) {
  const origW = ellipse.width;
  const origH = ellipse.height;
  const startX = startEv.clientX;
  const startY = startEv.clientY;

  const onMove = (e) => {
    const dx = (e.clientX - startX) / currentVp.scale;
    const dy = (e.clientY - startY) / currentVp.scale;
    let nw = origW, nh = origH;
    if (edge === 'e') nw = Math.max(10, origW + dx * 2);
    if (edge === 'w') nw = Math.max(10, origW - dx * 2);
    if (edge === 's') nh = Math.max(10, origH + dy * 2);
    if (edge === 'n') nh = Math.max(10, origH - dy * 2);

    store.updateObjectSilent(currentContextId, ellipse.id, { width: nw, height: nh });
    const tempCtx = store.currentContext;
    if (tempCtx) renderSvgLayer(tempCtx);
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    const dx = (e.clientX - startX) / currentVp.scale;
    const dy = (e.clientY - startY) / currentVp.scale;
    let nw = origW, nh = origH;
    if (edge === 'e') nw = Math.max(10, origW + dx * 2);
    if (edge === 'w') nw = Math.max(10, origW - dx * 2);
    if (edge === 's') nh = Math.max(10, origH + dy * 2);
    if (edge === 'n') nh = Math.max(10, origH - dy * 2);
    store.updateObject(ellipse.id, { width: nw, height: nh });
    ellipseEditId = ellipse.id;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Notes ──────────────────────────────────────────────────────────────────

function renderNotes(ctx) {
  // Remove stale note divs
  const existing = new Set([...worldEl.querySelectorAll('.canvas-note')].map(el => el.dataset.id));
  const current  = new Set(ctx.canvas.notes.map(n => n.id));
  existing.forEach(id => {
    if (!current.has(id)) worldEl.querySelector(`.canvas-note[data-id="${id}"]`)?.remove();
  });

  for (const note of ctx.canvas.notes) {
    if (isNoteHidden(note, ctx.canvas.objects)) continue;
    upsertNoteEl(note, ctx);
  }
}

function isNoteHidden(note, objects) {
  if (note.anchor.type !== 'object') return false;
  const obj = objects.find(o => o.id === note.anchor.objectId);
  return !obj || obj.archived;
}

function upsertNoteEl(note, ctx) {
  let el = worldEl.querySelector(`.canvas-note[data-id="${note.id}"]`);
  const isNew = !el;

  if (isNew) {
    el = document.createElement('div');
    el.className = 'canvas-note';
    el.dataset.id = note.id;
    worldEl.appendChild(el);
    attachNoteEvents(el, note, ctx);
  }

  const pos = resolveNoteAnchor(note, ctx.canvas.objects);
  el.style.left   = pos.x + 'px';
  el.style.top    = pos.y + 'px';
  el.style.width  = note.width  + 'px';
  el.style.height = note.height + 'px';

  el.classList.toggle('canvas-note-html', note.format === 'html');

  buildNoteContent(el, note, isNew);
}

function buildNoteContent(el, note, isNew) {
  if (note.format === 'html') {
    let iframe = el.querySelector('iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.className = 'canvas-note-iframe';
      iframe.sandbox = 'allow-same-origin';
      el.appendChild(iframe);
    }
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><style>${note.css || ''}</style></head><body>${note.content || ''}</body></html>`);
      doc.close();
    }
  } else {
    let ta = el.querySelector('.canvas-note-text');
    if (!ta) {
      ta = document.createElement('div');
      ta.className = 'canvas-note-text';
      ta.contentEditable = 'true';
      el.appendChild(ta);

      ta.addEventListener('input', () => {
        store.updateNoteSilent(currentContextId, note.id, { content: ta.innerText });
      });
      ta.addEventListener('blur', () => {
        store.updateNote(note.id, { content: ta.innerText });
      });
    }
    if (isNew) ta.innerText = note.content || '';
  }
}

function attachNoteEvents(el, note, ctx) {
  // Note toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'canvas-note-toolbar';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'canvas-note-toolbar-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Delete note';
  deleteBtn.dataset.tooltip = 'Delete note';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    store.deleteNote(note.id);
  });
  toolbar.appendChild(deleteBtn);

  if (note.format === 'html') {
    const editBtn = document.createElement('button');
    editBtn.className = 'canvas-note-toolbar-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit HTML/CSS';
    editBtn.dataset.tooltip = 'Edit HTML/CSS';
    editBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await showNoteEditorDialog(note);
      if (result) store.updateNote(note.id, result);
    });
    toolbar.appendChild(editBtn);
  }

  const tmplBtn = document.createElement('button');
  tmplBtn.className = 'canvas-note-toolbar-btn';
  tmplBtn.textContent = '☆';
  tmplBtn.title = 'Save as template';
  tmplBtn.dataset.tooltip = 'Save as template';
  tmplBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const tmpl = await showSaveTemplateDialog(note);
    if (tmpl) store.addNoteTemplate(tmpl);
  });
  toolbar.appendChild(tmplBtn);

  el.appendChild(toolbar);

  // Drag handle — a dedicated strip that doesn't conflict with contentEditable
  const dragHandle = document.createElement('div');
  dragHandle.className = 'canvas-note-drag-handle';
  el.appendChild(dragHandle);
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    startNoteDrag(e, note);
  });

  // Resize note
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'canvas-note-resize';
  resizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startNoteResize(e, note);
  });
  el.appendChild(resizeHandle);
}

function startNoteDrag(startEv, note) {
  const startX = startEv.clientX;
  const startY = startEv.clientY;
  const liveCtx = () => store.currentContext;
  const pos = resolveNoteAnchor(note, liveCtx()?.canvas.objects ?? []);
  const origAbsX = pos.x;
  const origAbsY = pos.y;

  const onMove = (e) => {
    const dx = (e.clientX - startX) / currentVp.scale;
    const dy = (e.clientY - startY) / currentVp.scale;
    const noteEl = worldEl.querySelector(`.canvas-note[data-id="${note.id}"]`);
    if (noteEl) {
      noteEl.style.left = (origAbsX + dx) + 'px';
      noteEl.style.top  = (origAbsY + dy) + 'px';
    }
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    const dx = (e.clientX - startX) / currentVp.scale;
    const dy = (e.clientY - startY) / currentVp.scale;

    if (note.anchor.type === 'frame') {
      store.updateNote(note.id, { x: origAbsX + dx, y: origAbsY + dy });
    } else {
      const ctx = liveCtx();
      const obj = ctx?.canvas.objects.find(o => o.id === note.anchor.objectId);
      if (!obj) {
        store.updateNote(note.id, { anchor: { type: 'frame' }, x: origAbsX + dx, y: origAbsY + dy });
      } else {
        store.updateNote(note.id, {
          x: note.x + dx,
          y: note.y + dy,
        });
      }
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

function startNoteResize(startEv, note) {
  const startX = startEv.clientX;
  const startY = startEv.clientY;
  const origW  = note.width;
  const origH  = note.height;

  const onMove = (e) => {
    const dw = (e.clientX - startX) / currentVp.scale;
    const dh = (e.clientY - startY) / currentVp.scale;
    const noteEl = worldEl.querySelector(`.canvas-note[data-id="${note.id}"]`);
    if (noteEl) {
      noteEl.style.width  = Math.max(80,  origW + dw) + 'px';
      noteEl.style.height = Math.max(40, origH + dh) + 'px';
    }
  };

  const onUp = (e) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    const dw = (e.clientX - startX) / currentVp.scale;
    const dh = (e.clientY - startY) / currentVp.scale;
    store.updateNote(note.id, {
      width:  Math.max(80,  origW + dw),
      height: Math.max(40, origH + dh),
    });
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Viewport pan / zoom ────────────────────────────────────────────────────

function onWheel(e) {
  e.preventDefault();
  const vp   = vpEl.getBoundingClientRect();
  const vpX  = e.clientX - vp.left;
  const vpY  = e.clientY - vp.top;

  let factor;
  if (e.ctrlKey || e.metaKey) {
    factor = 1 - e.deltaY * 0.01;
  } else {
    factor = e.deltaY < 0 ? 1.1 : 0.9;
  }

  currentVp = zoomViewport(currentVp, vpX, vpY, factor);
  store.setViewport(currentVp);
  applyViewport();

  const ctx = store.currentContext;
  if (ctx) renderSvgLayer(ctx);
}

function onVpMouseDown(e) {
  if (e.button !== 0) return;
  if (e.target !== vpEl && e.target !== worldEl) return;

  // Exit edit modes on canvas click
  if (lineEditId || ellipseEditId) { exitEditMode(); return; }

  const startX = e.clientX;
  const startY = e.clientY;
  const origOffX = currentVp.offsetX;
  const origOffY = currentVp.offsetY;

  vpEl.classList.add('canvas-panning');

  const onMove = (e2) => {
    currentVp = { ...currentVp, offsetX: origOffX + (e2.clientX - startX), offsetY: origOffY + (e2.clientY - startY) };
    applyViewport();
    const ctx = store.currentContext;
    if (ctx) renderSvgLayer(ctx);
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    vpEl.classList.remove('canvas-panning');
    store.setViewport(currentVp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Drop from palette ─────────────────────────────────────────────────────

export function handlePaletteDrop(e, type, template) {
  const vp   = vpEl?.getBoundingClientRect();
  if (!vp) return;
  const vpX  = e.clientX - vp.left;
  const vpY  = e.clientY - vp.top;
  const world = vpToWorld(vpX, vpY, currentVp);

  const ctx = store.currentContext;
  if (!ctx) return;

  createObjectFromDrop(type, world, template, ctx);
}

async function createObjectFromDrop(type, world, template, ctx) {

  const dropPos = {
    x: world.x - 60,
    y: world.y - 40,
    width: 160,
    height: 100,
    archived: false,
    attachedNoteIds: [],
  };

  if (type === 'note-plain' || type === 'note-html') {
    const note = {
      format: type === 'note-html' ? 'html' : 'plaintext',
      content: template?.content ?? '',
      css: template?.css ?? '',
      anchor: { type: 'frame' },
      x: world.x,
      y: world.y,
      width: 200,
      height: 100,
    };
    store.addNote(note);
    return;
  }

  if (type === 'note-template' && template) {
    const note = {
      format: template.format,
      content: template.content,
      css: template.css ?? '',
      anchor: { type: 'frame' },
      x: world.x,
      y: world.y,
      width: 200,
      height: 100,
    };
    store.addNote(note);
    return;
  }

  if (type === 'website') {
    const result = await showWebsiteDialog(dropPos);
    if (!result) return;
    store.addObject({ ...result, attachedNoteIds: [], archived: false });
    return;
  }

  if (type === 'application') {
    const result = await showApplicationDialog(dropPos);
    if (!result) return;
    store.addObject({ ...result, attachedNoteIds: [], archived: false });
    return;
  }

  if (type === 'file') {
    const result = await showFileDialog(dropPos);
    if (!result) return;
    store.addObject({ ...result, attachedNoteIds: [], archived: false });
    return;
  }

  if (type === 'subcontext') {
    const result = await showSubContextDialog(dropPos);
    if (!result) return;
    const subCtx = {
      id: uuid(),
      name: result.name,
      canvas: { objects: [], notes: [], viewport: { scale: 1, offsetX: 40, offsetY: 40 } },
      archived: false,
    };
    store.addObject({
      ...dropPos,
      type: 'subcontext',
      label: result.name,
      image: null,
      context: subCtx,
      attachedNoteIds: [],
      archived: false,
    });
    return;
  }

  if (type === 'line') {
    const lineId = uuid();
    store.addObject({
      id: lineId,
      type: 'line',
      label: '',
      x: 0, y: 0, width: 0, height: 0,
      image: null,
      archived: false,
      attachedNoteIds: [],
      start: { type: 'canvas', x: world.x - 50, y: world.y },
      end:   { type: 'canvas', x: world.x + 50, y: world.y },
    });
    lineEditId = lineId;
    ellipseEditId = null;
    return;
  }

  if (type === 'ellipse') {
    const eid = uuid();
    store.addObject({
      id: eid,
      type: 'ellipse',
      label: '',
      x: 0, y: 0, width: 200, height: 120,
      image: null,
      archived: false,
      attachedNoteIds: [],
      center: { type: 'canvas', x: world.x, y: world.y },
      containedIds: [],
    });
    ellipseEditId = eid;
    lineEditId = null;
    return;
  }
}

// ── Fit to screen ─────────────────────────────────────────────────────────

function fitToScreenAction() {
  const ctx = store.currentContext;
  if (!ctx || !vpEl) return;
  const rect = vpEl.getBoundingClientRect();
  const vp = fitToScreen(ctx.canvas.objects, rect.width, rect.height);
  if (vp) {
    currentVp = vp;
    store.setViewport(vp);
    applyViewport();
    renderSvgLayer(ctx);
  }
}

// ── Hit testing ───────────────────────────────────────────────────────────

function findObjectAtVpPos(vpX, vpY, objects) {
  const worldPos = vpToWorld(vpX, vpY, currentVp);
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.archived || o.type === 'line' || o.type === 'ellipse') continue;
    if (
      worldPos.x >= o.x && worldPos.x <= o.x + o.width &&
      worldPos.y >= o.y && worldPos.y <= o.y + o.height
    ) {
      return o;
    }
  }
  return null;
}
