import { uuid } from './utils.js';

// ── Default state factory ──────────────────────────────────────────────────

function defaultContext(name) {
  return {
    id: uuid(),
    name,
    canvas: { objects: [], notes: [], viewport: { scale: 1, offsetX: 40, offsetY: 40 } },
    archived: false,
  };
}

function defaultState() {
  const ctx = defaultContext('My Workspace');
  return { version: 1, contexts: [ctx], noteTemplates: [] };
}

// ── Store ──────────────────────────────────────────────────────────────────

class Store {
  constructor() {
    this._state = defaultState();
    this._listeners = [];

    // Navigation state (not persisted)
    this._activeContextId = null;   // top-level context id (tab)
    this._navStack = [];            // [contextId, ...] from root to current leaf
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _notify() {
    for (const fn of this._listeners) fn(this._state);
  }

  // ── Load / save ───────────────────────────────────────────────────────────

  async init() {
    const saved = await window.api.state.load();
    if (saved && saved.version === 1 && Array.isArray(saved.contexts)) {
      this._state = saved;
    }
    if (this._state.contexts.length === 0) {
      this._state.contexts.push(defaultContext('My Workspace'));
    }
    const firstActive = this._state.contexts.find(c => !c.archived);
    this._activeContextId = firstActive?.id ?? this._state.contexts[0].id;
    this._navStack = [this._activeContextId];
    this._notify();
  }

  _persist() {
    window.api.state.save(this._state);
  }

  // Called when main process writes state from outside (e.g. HTTP /add)
  async reload() {
    const saved = await window.api.state.load();
    if (saved && saved.version === 1 && Array.isArray(saved.contexts)) {
      this._state = saved;
      // Keep nav stack valid
      if (this._navStack.length === 0 || !this._findContextById(this._navStack[0])) {
        const first = this._state.contexts.find(c => !c.archived) ?? this._state.contexts[0];
        this._activeContextId = first?.id;
        this._navStack = [this._activeContextId];
      }
      this._notify();
    }
  }

  // ── State accessors ───────────────────────────────────────────────────────

  get state() { return this._state; }
  get activeContextId() { return this._activeContextId; }
  get navStack() { return [...this._navStack]; }

  // Current leaf context (the one currently displayed on canvas)
  get currentContext() {
    return this._findContextById(this._navStack[this._navStack.length - 1]);
  }

  // Top-level context (the active tab)
  get topLevelContext() {
    return this._state.contexts.find(c => c.id === this._activeContextId);
  }

  _findContextById(id, contexts = this._state.contexts) {
    for (const ctx of contexts) {
      if (ctx.id === id) return ctx;
      const nested = this._findInObjects(id, ctx.canvas.objects);
      if (nested) return nested;
    }
    return null;
  }

  _findInObjects(id, objects) {
    for (const obj of objects) {
      if (obj.type === 'subcontext') {
        if (obj.context.id === id) return obj.context;
        const nested = this._findInObjects(id, obj.context.canvas.objects);
        if (nested) return nested;
      }
    }
    return null;
  }

  // Build nav stack path (array of context names/ids for breadcrumb)
  getBreadcrumbs() {
    const crumbs = [];
    for (const id of this._navStack) {
      const ctx = this._findContextById(id);
      if (ctx) crumbs.push({ id, name: ctx.name });
    }
    return crumbs;
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  setActiveTab(contextId) {
    this._activeContextId = contextId;
    this._navStack = [contextId];
    this._notify();
  }

  navigateInto(subContextId) {
    this._navStack.push(subContextId);
    this._notify();
  }

  navigateBack() {
    if (this._navStack.length > 1) {
      this._navStack.pop();
      this._notify();
    }
  }

  navigateTo(contextId) {
    const idx = this._navStack.indexOf(contextId);
    if (idx !== -1) {
      this._navStack = this._navStack.slice(0, idx + 1);
    } else {
      this._navStack = [contextId];
    }
    this._notify();
  }

  // ── Context (tab) CRUD ────────────────────────────────────────────────────

  addContext(name) {
    const ctx = defaultContext(name);
    this._state = { ...this._state, contexts: [...this._state.contexts, ctx] };
    this._activeContextId = ctx.id;
    this._navStack = [ctx.id];
    this._persist();
    this._notify();
    return ctx;
  }

  renameContext(contextId, name) {
    const ctx = this._findContextById(contextId);
    if (ctx) {
      ctx.name = name;
      this._persist();
      this._notify();
    }
  }

  reorderContexts(fromIdx, toIdx) {
    const ctxs = [...this._state.contexts];
    const [moved] = ctxs.splice(fromIdx, 1);
    ctxs.splice(toIdx, 0, moved);
    this._state = { ...this._state, contexts: ctxs };
    this._persist();
    this._notify();
  }

  canArchiveOrDeleteContext(ctx) {
    return ctx.canvas.objects.every(o => o.archived);
  }

  archiveContext(contextId) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return false;
    if (!this.canArchiveOrDeleteContext(ctx)) return false;
    ctx.archived = true;

    // Switch to another active tab if needed
    if (this._activeContextId === contextId) {
      const next = this._state.contexts.find(c => !c.archived && c.id !== contextId);
      if (next) {
        this._activeContextId = next.id;
        this._navStack = [next.id];
      } else {
        this._activeContextId = null;
        this._navStack = [];
      }
    }

    this._persist();
    this._notify();
    return true;
  }

  deleteContext(contextId) {
    const ctx = this._state.contexts.find(c => c.id === contextId);
    if (!ctx) return false;
    if (!this.canArchiveOrDeleteContext(ctx)) return false;

    this._state = { ...this._state, contexts: this._state.contexts.filter(c => c.id !== contextId) };

    if (this._state.contexts.length === 0) {
      const newCtx = defaultContext('My Workspace');
      this._state.contexts.push(newCtx);
    }

    const stillActive = this._state.contexts.find(c => c.id === this._activeContextId);
    if (!stillActive) {
      this._activeContextId = this._state.contexts[0].id;
      this._navStack = [this._activeContextId];
    }

    this._persist();
    this._notify();
    return true;
  }

  unarchiveContext(contextId) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return;
    ctx.archived = false;
    this._persist();
    this._notify();
  }

  // ── Viewport ──────────────────────────────────────────────────────────────

  setViewport(viewport) {
    const ctx = this.currentContext;
    if (!ctx) return;
    ctx.canvas.viewport = viewport;
    this._persist();
  }

  // ── Object CRUD ───────────────────────────────────────────────────────────

  addObject(obj) {
    const ctx = this.currentContext;
    if (!ctx) return;
    ctx.canvas.objects.push({ ...obj, id: obj.id || uuid() });
    this._persist();
    this._notify();
  }

  updateObject(id, updates) {
    const ctx = this.currentContext;
    if (!ctx) return;
    const obj = ctx.canvas.objects.find(o => o.id === id);
    if (!obj) return;
    Object.assign(obj, updates);
    this._persist();
    this._notify();
  }

  // Update object WITHOUT triggering full re-render (used during drag)
  updateObjectSilent(contextId, id, updates) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return;
    const obj = ctx.canvas.objects.find(o => o.id === id);
    if (obj) Object.assign(obj, updates);
  }

  // Move multiple objects by delta simultaneously
  moveObjects(contextId, idSet, dx, dy) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return;
    for (const obj of ctx.canvas.objects) {
      if (!idSet.has(obj.id)) continue;
      if (obj.type === 'ellipse') {
        const ep = obj.center;
        if (ep.type === 'canvas') {
          obj.center = { ...ep, x: ep.x + dx, y: ep.y + dy };
        }
        // anchored center follows its object, but we still update position for archived
      } else if (obj.type === 'line') {
        // lines don't have x/y — nothing to move
      } else {
        obj.x = (obj.x || 0) + dx;
        obj.y = (obj.y || 0) + dy;
      }
    }
    this._persist();
  }

  canArchiveOrDeleteObject(obj) {
    return obj.archived !== undefined || true;
  }

  archiveObject(contextId, objectId) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return false;
    const obj = ctx.canvas.objects.find(o => o.id === objectId);
    if (!obj) return false;

    if (obj.type === 'subcontext') {
      if (!this.canArchiveOrDeleteContext(obj.context)) return false;
      obj.context.archived = true;
    }

    obj.archived = true;
    this._persist();
    this._notify();
    return true;
  }

  deleteObject(contextId, objectId) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return false;
    const obj = ctx.canvas.objects.find(o => o.id === objectId);
    if (!obj) return false;

    if (obj.type === 'subcontext') {
      if (!this.canArchiveOrDeleteContext(obj.context)) return false;
    }

    // Revert anchored endpoints / note anchors that reference this object
    this._revertReferences(ctx, objectId);

    ctx.canvas.objects = ctx.canvas.objects.filter(o => o.id !== objectId);

    // Remove from any ellipse containedIds
    for (const o of ctx.canvas.objects) {
      if (o.type === 'ellipse') {
        o.containedIds = (o.containedIds || []).filter(id => id !== objectId);
      }
    }

    this._persist();
    this._notify();
    return true;
  }

  _revertReferences(ctx, deletedId) {
    for (const obj of ctx.canvas.objects) {
      if (obj.type === 'line') {
        if (obj.start?.type === 'anchored' && obj.start.objectId === deletedId) {
          const resolved = this._resolveEpForContext(ctx, obj.start);
          obj.start = { type: 'canvas', x: resolved.x, y: resolved.y };
        }
        if (obj.end?.type === 'anchored' && obj.end.objectId === deletedId) {
          const resolved = this._resolveEpForContext(ctx, obj.end);
          obj.end = { type: 'canvas', x: resolved.x, y: resolved.y };
        }
      }
      if (obj.type === 'ellipse') {
        if (obj.center?.type === 'anchored' && obj.center.objectId === deletedId) {
          const resolved = this._resolveEpForContext(ctx, obj.center);
          obj.center = { type: 'canvas', x: resolved.x, y: resolved.y };
        }
      }
    }
    for (const note of ctx.canvas.notes) {
      if (note.anchor?.type === 'object' && note.anchor.objectId === deletedId) {
        const absPos = this._resolveNotePosForContext(ctx, note);
        note.anchor = { type: 'frame' };
        note.x = absPos.x;
        note.y = absPos.y;
      }
    }
  }

  _resolveEpForContext(ctx, ep) {
    if (ep.type === 'canvas') return { x: ep.x, y: ep.y };
    const obj = ctx.canvas.objects.find(o => o.id === ep.objectId);
    if (!obj) return { x: ep.x ?? 0, y: ep.y ?? 0 };
    return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
  }

  _resolveNotePosForContext(ctx, note) {
    if (note.anchor.type === 'frame') return { x: note.x, y: note.y };
    const obj = ctx.canvas.objects.find(o => o.id === note.anchor.objectId);
    if (!obj) return { x: note.x, y: note.y };
    const box = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
    let cx, cy;
    switch (note.anchor.corner) {
      case 'top-left':     cx = box.x;        cy = box.y;        break;
      case 'top-right':    cx = box.x + box.w; cy = box.y;        break;
      case 'bottom-left':  cx = box.x;        cy = box.y + box.h; break;
      case 'bottom-right': cx = box.x + box.w; cy = box.y + box.h; break;
      default:             cx = box.x;        cy = box.y;
    }
    return { x: cx + note.x, y: cy + note.y };
  }

  unarchiveObject(contextId, objectId) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return;
    const obj = ctx.canvas.objects.find(o => o.id === objectId);
    if (!obj) return;
    obj.archived = false;
    if (obj.type === 'subcontext') obj.context.archived = false;
    this._persist();
    this._notify();
  }

  // ── Note CRUD ─────────────────────────────────────────────────────────────

  addNote(note) {
    const ctx = this.currentContext;
    if (!ctx) return;
    ctx.canvas.notes.push({ ...note, id: note.id || uuid() });
    this._persist();
    this._notify();
  }

  updateNote(id, updates) {
    const ctx = this.currentContext;
    if (!ctx) return;
    const note = ctx.canvas.notes.find(n => n.id === id);
    if (!note) return;
    Object.assign(note, updates);
    this._persist();
    this._notify();
  }

  deleteNote(id) {
    const ctx = this.currentContext;
    if (!ctx) return;
    ctx.canvas.notes = ctx.canvas.notes.filter(n => n.id !== id);
    this._persist();
    this._notify();
  }

  updateNoteSilent(contextId, id, updates) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return;
    const note = ctx.canvas.notes.find(n => n.id === id);
    if (note) Object.assign(note, updates);
  }

  // ── Note templates ────────────────────────────────────────────────────────

  addNoteTemplate(tmpl) {
    this._state.noteTemplates.push({ ...tmpl, id: uuid() });
    this._persist();
    this._notify();
  }

  deleteNoteTemplate(id) {
    this._state.noteTemplates = this._state.noteTemplates.filter(t => t.id !== id);
    this._persist();
    this._notify();
  }

  // ── Archive helpers ───────────────────────────────────────────────────────

  unarchiveAllChildren(contextId) {
    const ctx = this._findContextById(contextId);
    if (!ctx) return;
    for (const obj of ctx.canvas.objects) {
      if (obj.archived) {
        obj.archived = false;
        if (obj.type === 'subcontext') obj.context.archived = false;
      }
    }
    this._persist();
    this._notify();
  }
}

export const store = new Store();
