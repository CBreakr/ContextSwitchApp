let serverStatus = { running: false, port: null, error: null };
let currentPort  = 27182;
let isOpen       = false;

export function showSettings() {
  isOpen = true;
  const el = document.getElementById('settings-overlay');
  el.classList.remove('hidden');
  renderSettings(el);
}

function hideSettings() {
  isOpen = false;
  document.getElementById('settings-overlay').classList.add('hidden');
}

export function renderSettings(container) {
  if (!container) return;

  // Listen for server status updates from main (attach once)
  if (!container._statusBound) {
    container._statusBound = true;
    window.api.settings.onStatus((s) => {
      serverStatus = s;
      if (isOpen) renderSettings(container);
    });
    // Load initial state
    window.api.settings.load().then((s) => {
      serverStatus = s.serverStatus ?? serverStatus;
      currentPort  = s.port ?? currentPort;
    });
  }

  if (!isOpen) return;

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-header';

  const title = document.createElement('h2');
  title.className = 'settings-title';
  title.textContent = 'Settings';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'settings-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.dataset.tooltip = 'Close';
  closeBtn.addEventListener('click', hideSettings);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // HTTP Server section
  const section = document.createElement('div');
  section.className = 'settings-section';

  const sectionTitle = document.createElement('h3');
  sectionTitle.className = 'settings-section-title';
  sectionTitle.textContent = 'Chrome Extension Server';
  section.appendChild(sectionTitle);

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'ContextSwitch runs a local HTTP server so the Chrome extension can add pages. ' +
    'The port set here must match the port in the extension settings.';
  section.appendChild(desc);

  // Status badge
  const statusRow = document.createElement('div');
  statusRow.className = 'settings-row';

  const statusLabel = document.createElement('span');
  statusLabel.className = 'settings-label';
  statusLabel.textContent = 'Status';
  statusRow.appendChild(statusLabel);

  const badge = document.createElement('span');
  if (serverStatus.running) {
    badge.className = 'settings-badge settings-badge-ok';
    badge.textContent = `Running on port ${serverStatus.port}`;
  } else if (serverStatus.error) {
    badge.className = 'settings-badge settings-badge-error';
    badge.textContent = serverStatus.error;
  } else {
    badge.className = 'settings-badge settings-badge-idle';
    badge.textContent = 'Not started';
  }
  statusRow.appendChild(badge);
  section.appendChild(statusRow);

  // Port input
  const portRow = document.createElement('div');
  portRow.className = 'settings-row';

  const portLabel = document.createElement('label');
  portLabel.className = 'settings-label';
  portLabel.htmlFor = 'settings-port-input';
  portLabel.textContent = 'Port';
  portRow.appendChild(portLabel);

  const portInput = document.createElement('input');
  portInput.type = 'number';
  portInput.id   = 'settings-port-input';
  portInput.className = 'settings-input';
  portInput.min   = '1024';
  portInput.max   = '65535';
  portInput.value = currentPort;
  portRow.appendChild(portInput);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'settings-save-btn';
  saveBtn.textContent = 'Apply';
  saveBtn.addEventListener('click', async () => {
    const port = parseInt(portInput.value, 10);
    if (!port || port < 1024 || port > 65535) {
      portInput.classList.add('settings-input-error');
      return;
    }
    portInput.classList.remove('settings-input-error');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Applying…';
    const result = await window.api.settings.save({ port });
    currentPort  = port;
    serverStatus = result.serverStatus ?? serverStatus;
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Apply';
    renderSettings(container);
  });
  portRow.appendChild(saveBtn);
  section.appendChild(portRow);

  panel.appendChild(section);
  container.appendChild(panel);
}
