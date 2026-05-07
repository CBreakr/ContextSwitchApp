import { handlePaletteDrop } from './canvas-view.js';
import { store } from '../store.js';

let isOpen = true;

export function renderPalette(container, noteTemplates) {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'palette-panel' + (isOpen ? ' palette-open' : ' palette-closed');

  // Toggle button
  const toggle = document.createElement('button');
  toggle.className = 'palette-toggle-btn';
  toggle.title = isOpen ? 'Close palette' : 'Open palette';
  toggle.textContent = isOpen ? '›' : '‹';
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    renderPalette(container, noteTemplates);
  });
  container.appendChild(toggle);

  if (!isOpen) {
    container.appendChild(panel);
    return;
  }

  // Header
  const header = document.createElement('div');
  header.className = 'palette-header';
  header.textContent = 'Objects';
  panel.appendChild(header);

  // Object types
  const objectTypes = [
    { type: 'subcontext', label: 'Sub-Context',  icon: '⬡' },
    { type: 'website',    label: 'Website',       icon: '🌐' },
    { type: 'application',label: 'Application',   icon: '⚙' },
    { type: 'file',       label: 'File / Folder', icon: '📁' },
    { type: 'line',       label: 'Line',          icon: '╱' },
    { type: 'ellipse',    label: 'Ellipse',       icon: '○' },
  ];

  for (const entry of objectTypes) {
    panel.appendChild(buildPaletteEntry(entry.type, entry.label, entry.icon));
  }

  // Notes section
  const notesHeader = document.createElement('div');
  notesHeader.className = 'palette-header';
  notesHeader.textContent = 'Notes';
  panel.appendChild(notesHeader);

  panel.appendChild(buildPaletteEntry('note-plain', 'Plain text note', '📝'));
  panel.appendChild(buildPaletteEntry('note-html',  'HTML + CSS note', '📄'));

  if (noteTemplates.length > 0) {
    const tmplHeader = document.createElement('div');
    tmplHeader.className = 'palette-section-label';
    tmplHeader.textContent = 'Templates';
    panel.appendChild(tmplHeader);

    for (const tmpl of noteTemplates) {
      const row = buildPaletteEntry('note-template', tmpl.name, '⭐', tmpl);
      const delBtn = document.createElement('button');
      delBtn.className = 'palette-template-delete';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete template';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.deleteNoteTemplate(tmpl.id);
      });
      row.appendChild(delBtn);
      panel.appendChild(row);
    }
  }

  container.appendChild(panel);
}

function buildPaletteEntry(type, label, icon, template = null) {
  const entry = document.createElement('div');
  entry.className = 'palette-entry';
  entry.draggable = true;
  entry.dataset.paletteType = type;

  const iconEl = document.createElement('span');
  iconEl.className = 'palette-entry-icon';
  iconEl.textContent = icon;
  entry.appendChild(iconEl);

  const labelEl = document.createElement('span');
  labelEl.className = 'palette-entry-label';
  labelEl.textContent = label;
  entry.appendChild(labelEl);

  // Drag events
  entry.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/palette-type', type);
    if (template) e.dataTransfer.setData('text/palette-template', JSON.stringify(template));
  });

  // The canvas viewport receives the drop
  const canvasVp = document.querySelector('.canvas-viewport');
  if (canvasVp && !canvasVp._dropBound) {
    canvasVp._dropBound = true;
    canvasVp.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    canvasVp.addEventListener('drop', (e) => {
      e.preventDefault();
      const t = e.dataTransfer.getData('text/palette-type');
      const tmplRaw = e.dataTransfer.getData('text/palette-template');
      const tmpl = tmplRaw ? JSON.parse(tmplRaw) : null;
      if (t) handlePaletteDrop(e, t, tmpl);
    });
  }

  return entry;
}
