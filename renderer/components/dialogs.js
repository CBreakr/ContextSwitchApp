// ── Generic dialog infrastructure ──────────────────────────────────────────

function overlay() { return document.getElementById('dialog-overlay'); }

function openDialog(content) {
  const ov = overlay();
  ov.innerHTML = '';
  ov.appendChild(content);
  ov.classList.remove('hidden');
  return ov;
}

function closeDialog() {
  const ov = overlay();
  ov.classList.add('hidden');
  ov.innerHTML = '';
}

// ── Confirm ────────────────────────────────────────────────────────────────

export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = title;
    box.appendChild(h);

    const p = document.createElement('p');
    p.className = 'dialog-message';
    p.textContent = message;
    box.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const cancel = document.createElement('button');
    cancel.className = 'dialog-btn dialog-btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { closeDialog(); resolve(false); });

    const ok = document.createElement('button');
    ok.className = 'dialog-btn dialog-btn-danger';
    ok.textContent = 'Confirm';
    ok.addEventListener('click', () => { closeDialog(); resolve(true); });

    actions.appendChild(cancel);
    actions.appendChild(ok);
    box.appendChild(actions);

    openDialog(box);
    ok.focus();
  });
}

// ── Alert ──────────────────────────────────────────────────────────────────

export function showAlert(title, message) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = title;
    box.appendChild(h);

    const p = document.createElement('p');
    p.className = 'dialog-message';
    p.textContent = message;
    box.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const ok = document.createElement('button');
    ok.className = 'dialog-btn dialog-btn-primary';
    ok.textContent = 'OK';
    ok.addEventListener('click', () => { closeDialog(); resolve(); });
    actions.appendChild(ok);
    box.appendChild(actions);

    openDialog(box);
    ok.focus();
  });
}

// ── Prompt (text input) ────────────────────────────────────────────────────

export function showPrompt(title, placeholder = '') {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = title;
    box.appendChild(h);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog-input';
    input.placeholder = placeholder;
    box.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const cancel = document.createElement('button');
    cancel.className = 'dialog-btn dialog-btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { closeDialog(); resolve(null); });

    const ok = document.createElement('button');
    ok.className = 'dialog-btn dialog-btn-primary';
    ok.textContent = 'Create';
    const commit = () => {
      const val = input.value.trim();
      if (!val) return;
      closeDialog();
      resolve(val);
    };
    ok.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') { closeDialog(); resolve(null); }
    });

    actions.appendChild(cancel);
    actions.appendChild(ok);
    box.appendChild(actions);

    openDialog(box);
    input.focus();
  });
}

// ── Website creation dialog ────────────────────────────────────────────────

export function showWebsiteDialog(dropPos) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box dialog-wide';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'Add Website';
    box.appendChild(h);

    box.appendChild(labeledInput('URL', 'website-url', 'https://'));
    box.appendChild(labeledInput('Label', 'website-label', 'My Site'));

    // Screenshot area
    const screenshotRow = document.createElement('div');
    screenshotRow.className = 'dialog-row';

    const screenshotLabel = document.createElement('label');
    screenshotLabel.className = 'dialog-field-label';
    screenshotLabel.textContent = 'Screenshot';
    screenshotRow.appendChild(screenshotLabel);

    const screenshotPreview = document.createElement('div');
    screenshotPreview.className = 'dialog-screenshot-preview';
    screenshotPreview.textContent = 'No screenshot';
    screenshotRow.appendChild(screenshotPreview);

    let screenshotData = null;

    const captureBtn = document.createElement('button');
    captureBtn.className = 'dialog-btn dialog-btn-secondary dialog-btn-sm';
    captureBtn.textContent = 'Capture';
    captureBtn.addEventListener('click', async () => {
      const urlInput = box.querySelector('#website-url');
      const url = urlInput.value.trim();
      if (!url) { alert('Enter a URL first'); return; }
      captureBtn.textContent = 'Capturing…';
      captureBtn.disabled = true;
      const data = await window.api.web.screenshot(url);
      captureBtn.textContent = 'Capture';
      captureBtn.disabled = false;
      if (data) {
        screenshotData = data;
        screenshotPreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = data;
        img.className = 'dialog-screenshot-img';
        screenshotPreview.appendChild(img);
      } else {
        screenshotPreview.textContent = 'Capture failed';
      }
    });
    screenshotRow.appendChild(captureBtn);

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'dialog-btn dialog-btn-secondary dialog-btn-sm';
    pasteBtn.textContent = 'Paste image';
    pasteBtn.addEventListener('click', async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('image/png')) {
            const blob = await item.getType('image/png');
            const reader = new FileReader();
            reader.onload = (e) => {
              screenshotData = e.target.result;
              screenshotPreview.innerHTML = '';
              const img = document.createElement('img');
              img.src = screenshotData;
              img.className = 'dialog-screenshot-img';
              screenshotPreview.appendChild(img);
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      } catch (e) {
        // clipboard not available
      }
    });
    screenshotRow.appendChild(pasteBtn);
    box.appendChild(screenshotRow);

    const actions = actionRow(
      () => { closeDialog(); resolve(null); },
      () => {
        const url   = box.querySelector('#website-url').value.trim();
        const label = box.querySelector('#website-label').value.trim() || url;
        if (!url) return;
        if (!screenshotData) { showAlert('Screenshot required', 'Please capture or paste a screenshot.'); return; }
        closeDialog();
        resolve({ type: 'website', url, label, image: screenshotData, ...dropPos });
      },
      'Add'
    );
    box.appendChild(actions);
    openDialog(box);
    box.querySelector('#website-url').focus();
  });
}

// ── Application creation dialog ────────────────────────────────────────────

export function showApplicationDialog(dropPos) {
  return new Promise(async (resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box dialog-wide';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'Add Application';
    box.appendChild(h);

    const searchRow = document.createElement('div');
    searchRow.className = 'dialog-row';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'dialog-input';
    searchInput.placeholder = 'Search applications…';
    searchRow.appendChild(searchInput);
    box.appendChild(searchRow);

    const listEl = document.createElement('div');
    listEl.className = 'dialog-app-list';
    listEl.textContent = 'Loading…';
    box.appendChild(listEl);

    let allApps = [];
    let selectedApp = null;

    const renderList = (filter) => {
      listEl.innerHTML = '';
      const filtered = filter
        ? allApps.filter(a => a.appName.toLowerCase().includes(filter.toLowerCase()))
        : allApps;
      if (filtered.length === 0) {
        listEl.textContent = 'No apps found';
        return;
      }
      for (const app of filtered.slice(0, 200)) {
        const row = document.createElement('div');
        row.className = 'dialog-app-row';
        if (selectedApp?.bundlePath === app.bundlePath) row.classList.add('dialog-app-row-selected');
        row.textContent = app.appName;
        row.addEventListener('click', () => {
          selectedApp = app;
          listEl.querySelectorAll('.dialog-app-row').forEach(r => r.classList.remove('dialog-app-row-selected'));
          row.classList.add('dialog-app-row-selected');
        });
        row.addEventListener('dblclick', () => {
          selectedApp = app;
          commit();
        });
        listEl.appendChild(row);
      }
    };

    searchInput.addEventListener('input', () => renderList(searchInput.value));

    const actions = actionRow(
      () => { closeDialog(); resolve(null); },
      () => commit(),
      'Add'
    );
    box.appendChild(actions);

    openDialog(box);
    searchInput.focus();

    // Load apps async
    allApps = await window.api.apps.list();
    renderList('');

    function commit() {
      if (!selectedApp) return;
      closeDialog();
      resolve({
        type: 'application',
        bundlePath: selectedApp.bundlePath,
        appName: selectedApp.appName,
        label: selectedApp.appName,
        image: null,
        ...dropPos,
      });
    }
  });
}

// ── File/Folder creation dialog ────────────────────────────────────────────

export function showFileDialog(dropPos) {
  return new Promise(async (resolve) => {
    const filePath = await window.api.file.pick();
    if (!filePath) { resolve(null); return; }

    const box = document.createElement('div');
    box.className = 'dialog-box';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'Add File / Folder';
    box.appendChild(h);

    const pathRow = document.createElement('div');
    pathRow.className = 'dialog-row';
    pathRow.innerHTML = `<span class="dialog-field-label">Path</span><span class="dialog-path-display">${filePath}</span>`;
    box.appendChild(pathRow);

    box.appendChild(labeledInput('Label', 'file-label', filePath.split('/').pop()));
    box.appendChild(labeledInput('Open with (app path)', 'file-default-app', '/usr/bin/open'));

    const actions = actionRow(
      () => { closeDialog(); resolve(null); },
      () => {
        const label      = box.querySelector('#file-label').value.trim() || filePath.split('/').pop();
        const defaultApp = box.querySelector('#file-default-app').value.trim() || '/usr/bin/open';
        closeDialog();
        resolve({ type: 'file', path: filePath, label, defaultApp, image: null, ...dropPos });
      },
      'Add'
    );
    box.appendChild(actions);
    openDialog(box);
  });
}

// ── Sub-context creation dialog ────────────────────────────────────────────

export function showSubContextDialog(dropPos) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'New Sub-Context';
    box.appendChild(h);

    box.appendChild(labeledInput('Name', 'subctx-name', 'Sub-context'));

    const actions = actionRow(
      () => { closeDialog(); resolve(null); },
      () => {
        const name = box.querySelector('#subctx-name').value.trim();
        if (!name) return;
        closeDialog();
        resolve({ name, ...dropPos });
      },
      'Create'
    );
    box.appendChild(actions);
    openDialog(box);
    box.querySelector('#subctx-name').focus();
  });
}

// ── Object properties dialog ────────────────────────────────────────────────

export function showObjectPropertiesDialog(obj) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box dialog-wide';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'Edit Properties';
    box.appendChild(h);

    box.appendChild(labeledInput('Label', 'obj-label', obj.label));

    if (obj.type === 'website') {
      box.appendChild(labeledInput('URL', 'obj-url', obj.url));
    }
    if (obj.type === 'application') {
      box.appendChild(labeledInput('Bundle Path', 'obj-bundle', obj.bundlePath));
      box.appendChild(labeledInput('App Name', 'obj-appname', obj.appName));
    }
    if (obj.type === 'file') {
      box.appendChild(labeledInput('Path', 'obj-path', obj.path));
      box.appendChild(labeledInput('Open With', 'obj-defaultapp', obj.defaultApp));
    }

    const actions = actionRow(
      () => { closeDialog(); resolve(null); },
      () => {
        const updates = { label: box.querySelector('#obj-label').value.trim() || obj.label };
        if (obj.type === 'website')     updates.url        = box.querySelector('#obj-url').value.trim();
        if (obj.type === 'application') {
          updates.bundlePath = box.querySelector('#obj-bundle').value.trim();
          updates.appName    = box.querySelector('#obj-appname').value.trim();
        }
        if (obj.type === 'file') {
          updates.path       = box.querySelector('#obj-path').value.trim();
          updates.defaultApp = box.querySelector('#obj-defaultapp').value.trim();
        }
        closeDialog();
        resolve(updates);
      },
      'Save'
    );
    box.appendChild(actions);
    openDialog(box);
  });
}

// ── Note editor dialog ─────────────────────────────────────────────────────

export function showNoteEditorDialog(note) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box dialog-wide';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'Edit Note';
    box.appendChild(h);

    if (note.format === 'html') {
      // HTML editor
      const htmlLabel = document.createElement('label');
      htmlLabel.className = 'dialog-field-label';
      htmlLabel.textContent = 'HTML';
      box.appendChild(htmlLabel);
      const htmlEditor = document.createElement('textarea');
      htmlEditor.className = 'dialog-textarea dialog-textarea-code';
      htmlEditor.value = note.content;
      box.appendChild(htmlEditor);

      const cssLabel = document.createElement('label');
      cssLabel.className = 'dialog-field-label';
      cssLabel.textContent = 'CSS';
      box.appendChild(cssLabel);
      const cssEditor = document.createElement('textarea');
      cssEditor.className = 'dialog-textarea dialog-textarea-code';
      cssEditor.value = note.css || '';
      box.appendChild(cssEditor);

      const actions = actionRow(
        () => { closeDialog(); resolve(null); },
        () => {
          closeDialog();
          resolve({ content: htmlEditor.value, css: cssEditor.value });
        },
        'Save'
      );
      box.appendChild(actions);
    } else {
      // Plain text — just close, editing is inline
      closeDialog();
      resolve(null);
      return;
    }

    openDialog(box);
  });
}

// ── Note template save dialog ──────────────────────────────────────────────

export function showSaveTemplateDialog(note) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dialog-box';

    const h = document.createElement('h2');
    h.className = 'dialog-title';
    h.textContent = 'Save as Template';
    box.appendChild(h);

    box.appendChild(labeledInput('Template name', 'tmpl-name', 'My Template'));

    const actions = actionRow(
      () => { closeDialog(); resolve(null); },
      () => {
        const name = box.querySelector('#tmpl-name').value.trim();
        if (!name) return;
        closeDialog();
        resolve({ name, format: note.format, content: note.content, css: note.css || '' });
      },
      'Save'
    );
    box.appendChild(actions);
    openDialog(box);
    box.querySelector('#tmpl-name').focus();
  });
}

// ── Attached notes dialog ──────────────────────────────────────────────────

export function showAttachedNotesInfo(count) {
  showAlert('Attached Notes', `This object has ${count} attached note(s). Notes are shown on the canvas anchored to this object's corners.`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function labeledInput(labelText, id, defaultValue = '') {
  const row = document.createElement('div');
  row.className = 'dialog-row';

  const lbl = document.createElement('label');
  lbl.className = 'dialog-field-label';
  lbl.htmlFor = id;
  lbl.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'dialog-input';
  input.value = defaultValue;

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

function actionRow(onCancel, onConfirm, confirmLabel = 'OK') {
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';

  const cancel = document.createElement('button');
  cancel.className = 'dialog-btn dialog-btn-secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', onCancel);

  const ok = document.createElement('button');
  ok.className = 'dialog-btn dialog-btn-primary';
  ok.textContent = confirmLabel;
  ok.addEventListener('click', onConfirm);

  actions.appendChild(cancel);
  actions.appendChild(ok);
  return actions;
}
