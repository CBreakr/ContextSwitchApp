const DEFAULT_PORT = 27182;

let port         = DEFAULT_PORT;
let destinations = [];
let selectedId   = null;
let screenshotUrl = null;

// ── View helpers ───────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showView('view-error');
}

// ── Storage ────────────────────────────────────────────────────────────────

function getPort() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ port: DEFAULT_PORT }, r => resolve(r.port));
  });
}

// ── Main init ──────────────────────────────────────────────────────────────

async function init() {
  showView('view-loading');

  port = await getPort();

  // Run screenshot capture and destination fetch in parallel
  const [screenshotResult, tab, destinationsResult] = await Promise.all([
    captureScreenshot(),
    getCurrentTab(),
    fetchDestinations(),
  ]);

  if (!destinationsResult.ok) {
    showError(destinationsResult.error);
    return;
  }

  destinations  = destinationsResult.data;
  screenshotUrl = screenshotResult;

  // Pre-fill form
  const labelInput = document.getElementById('label-input');
  labelInput.value = tab?.title ?? '';

  if (screenshotUrl) {
    document.getElementById('screenshot-img').src = screenshotUrl;
  } else {
    document.querySelector('.screenshot-wrap').style.display = 'none';
  }

  renderContextList('');
  showView('view-form');
  labelInput.focus();
  labelInput.select();
}

// ── Screenshot ─────────────────────────────────────────────────────────────

function captureScreenshot() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'capture-screenshot' }, response => {
      if (chrome.runtime.lastError || !response || response.error) {
        resolve(null);
      } else {
        resolve(response.dataUrl);
      }
    });
  });
}

// ── Current tab ────────────────────────────────────────────────────────────

function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] ?? null));
  });
}

// ── Destinations fetch ─────────────────────────────────────────────────────

async function fetchDestinations() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/destinations`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `Server returned ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { ok: false, error: 'Connection timed out. Is ContextSwitch running?' };
    }
    return { ok: false, error: 'Could not reach ContextSwitch. Is the app open?' };
  }
}

// ── Context list ───────────────────────────────────────────────────────────

function renderContextList(filter) {
  const list    = document.getElementById('context-list');
  const addBtn  = document.getElementById('add-btn');
  const lower   = filter.toLowerCase();
  const matches = filter
    ? destinations.filter(d => d.displayPath.toLowerCase().includes(lower))
    : destinations;

  list.innerHTML = '';

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'context-empty';
    empty.textContent = filter ? 'No matching contexts' : 'No contexts found';
    list.appendChild(empty);
    return;
  }

  for (const dest of matches) {
    const row = document.createElement('div');
    row.className = 'context-row';
    if (dest.id === selectedId) row.classList.add('context-row-selected');

    // Highlight matching segment
    const parts   = dest.displayPath.split(' › ');
    const pathEl  = document.createElement('span');
    pathEl.className = 'context-path';
    parts.forEach((part, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'context-sep';
        sep.textContent = ' › ';
        pathEl.appendChild(sep);
      }
      const span = document.createElement('span');
      span.textContent = part;
      if (i === parts.length - 1) span.className = 'context-leaf';
      pathEl.appendChild(span);
    });

    row.appendChild(pathEl);

    row.addEventListener('click', () => {
      selectedId = dest.id;
      addBtn.disabled = false;
      list.querySelectorAll('.context-row').forEach(r => r.classList.remove('context-row-selected'));
      row.classList.add('context-row-selected');
    });

    list.appendChild(row);
  }
}

// ── Add button ─────────────────────────────────────────────────────────────

async function handleAdd() {
  if (!selectedId) return;

  const addBtn = document.getElementById('add-btn');
  addBtn.disabled    = true;
  addBtn.textContent = 'Adding…';

  const tab = await getCurrentTab();

  const body = {
    url:           tab?.url ?? '',
    label:         document.getElementById('label-input').value.trim() || tab?.title || tab?.url,
    destinationId: selectedId,
    screenshot:    screenshotUrl,
  };

  try {
    const postController = new AbortController();
    const postTimer = setTimeout(() => postController.abort(), 8000);
    const res = await fetch(`http://127.0.0.1:${port}/add`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  postController.signal,
    });
    clearTimeout(postTimer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    showView('view-success');
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    addBtn.disabled    = false;
    addBtn.textContent = 'Add to ContextSwitch';
    showError(e.message ?? 'Failed to add page. Try again.');
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────

document.getElementById('add-btn').addEventListener('click', handleAdd);

document.getElementById('search-input').addEventListener('input', e => {
  renderContextList(e.target.value);
});

document.getElementById('open-settings').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById('error-open-settings').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Submit on Enter when search or label is focused
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('add-btn').disabled) handleAdd();
});

init();
