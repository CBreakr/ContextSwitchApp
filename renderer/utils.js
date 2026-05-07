export function uuid() {
  return crypto.randomUUID();
}

// ── Viewport coordinate transforms ─────────────────────────────────────────
// viewport = { scale, offsetX, offsetY }
// worldToVP: world coords → canvas-viewport-local coords
// vpToWorld: canvas-viewport-local coords → world coords

export function worldToVP(wx, wy, vp) {
  return {
    x: wx * vp.scale + vp.offsetX,
    y: wy * vp.scale + vp.offsetY,
  };
}

export function vpToWorld(vx, vy, vp) {
  return {
    x: (vx - vp.offsetX) / vp.scale,
    y: (vy - vp.offsetY) / vp.scale,
  };
}

// Zoom the viewport centered on (vpX, vpY)
export function zoomViewport(vp, vpX, vpY, factor) {
  const newScale = Math.max(0.05, Math.min(8, vp.scale * factor));
  const wx = (vpX - vp.offsetX) / vp.scale;
  const wy = (vpY - vp.offsetY) / vp.scale;
  return {
    scale: newScale,
    offsetX: vpX - wx * newScale,
    offsetY: vpY - wy * newScale,
  };
}

// ── Endpoint resolution ────────────────────────────────────────────────────

export function resolveEndpoint(ep, objects) {
  if (ep.type === 'canvas') return { x: ep.x, y: ep.y };
  const obj = objects.find(o => o.id === ep.objectId);
  if (!obj) return { x: ep.x ?? 0, y: ep.y ?? 0 }; // fallback
  return objectCenter(obj);
}

export function objectCenter(obj) {
  if (obj.type === 'ellipse') {
    const ep = obj.center;
    if (ep.type === 'canvas') return { x: ep.x, y: ep.y };
    // anchored ellipse center — resolved by caller with full objects list
    return { x: 0, y: 0 };
  }
  if (obj.type === 'line') return { x: 0, y: 0 };
  return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
}

// Resolve ellipse center fully (handles anchored-to-object)
export function resolveEllipseCenter(ellipse, objects) {
  const ep = ellipse.center;
  if (ep.type === 'canvas') return { x: ep.x, y: ep.y };
  const target = objects.find(o => o.id === ep.objectId);
  if (!target) return { x: ep.x ?? 0, y: ep.y ?? 0 };
  return objectCenter(target);
}

// ── Note anchor resolution ─────────────────────────────────────────────────

export function resolveNoteAnchor(note, objects) {
  if (note.anchor.type === 'frame') {
    return { x: note.x, y: note.y };
  }
  const obj = objects.find(o => o.id === note.anchor.objectId);
  if (!obj) return { x: note.x, y: note.y };

  const box = objectBoundingBox(obj);
  let cornerX, cornerY;
  switch (note.anchor.corner) {
    case 'top-left':     cornerX = box.x; cornerY = box.y; break;
    case 'top-right':    cornerX = box.x + box.w; cornerY = box.y; break;
    case 'bottom-left':  cornerX = box.x; cornerY = box.y + box.h; break;
    case 'bottom-right': cornerX = box.x + box.w; cornerY = box.y + box.h; break;
    default:             cornerX = box.x; cornerY = box.y;
  }
  return { x: cornerX + note.x, y: cornerY + note.y };
}

export function objectBoundingBox(obj) {
  if (obj.type === 'ellipse') return { x: 0, y: 0, w: 0, h: 0 }; // center-based
  if (obj.type === 'line')    return { x: 0, y: 0, w: 0, h: 0 };
  return { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
}

// ── Ellipse containment check ──────────────────────────────────────────────

export function isRectInsideEllipse(rect, cx, cy, rx, ry) {
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ];
  return corners.every(([px, py]) => {
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  });
}

// ── Transitive ellipse containment for move ────────────────────────────────

export function collectMoveTargets(ellipseId, objects, visited = new Set()) {
  if (visited.has(ellipseId)) return new Set();
  visited.add(ellipseId);

  const ellipse = objects.find(o => o.id === ellipseId);
  if (!ellipse || ellipse.type !== 'ellipse') return new Set();

  const targets = new Set();
  for (const id of (ellipse.containedIds || [])) {
    if (!visited.has(id)) {
      targets.add(id);
      const obj = objects.find(o => o.id === id);
      if (obj && obj.type === 'ellipse') {
        const sub = collectMoveTargets(id, objects, visited);
        sub.forEach(t => targets.add(t));
      }
    }
  }
  return targets;
}

// ── Fit-to-screen viewport ─────────────────────────────────────────────────

export function fitToScreen(objects, vpWidth, vpHeight, margin = 60) {
  const visible = objects.filter(o =>
    !o.archived && o.type !== 'line' && o.type !== 'ellipse'
  );
  if (visible.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of visible) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width);
    maxY = Math.max(maxY, o.y + o.height);
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const scale = Math.min(
    (vpWidth  - margin * 2) / contentW,
    (vpHeight - margin * 2) / contentH,
    4
  );
  const clampedScale = Math.max(0.05, scale);

  return {
    scale: clampedScale,
    offsetX: margin + (vpWidth  - margin * 2 - contentW * clampedScale) / 2 - minX * clampedScale,
    offsetY: margin + (vpHeight - margin * 2 - contentH * clampedScale) / 2 - minY * clampedScale,
  };
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

export function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e[k] = v;
  return e;
}

export function svgEl(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
