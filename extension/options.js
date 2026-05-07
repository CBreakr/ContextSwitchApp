const DEFAULT_PORT = 27182;

const portInput = document.getElementById('port-input');
const saveBtn   = document.getElementById('save-btn');
const hint      = document.getElementById('port-hint');

function setHint(text, isError) {
  hint.textContent = text;
  hint.className   = 'field-hint' + (isError ? ' field-hint-error' : ' field-hint-ok');
}

// Load saved port on open
chrome.storage.sync.get({ port: DEFAULT_PORT }, ({ port }) => {
  portInput.value = port;
});

saveBtn.addEventListener('click', () => {
  const port = parseInt(portInput.value, 10);
  if (!port || port < 1024 || port > 65535) {
    setHint('Enter a valid port number between 1024 and 65535.', true);
    return;
  }

  chrome.storage.sync.set({ port }, () => {
    setHint(`Saved. Make sure the ContextSwitch app is also set to port ${port}.`, false);
    setTimeout(() => { hint.textContent = ''; hint.className = 'field-hint'; }, 4000);
  });
});

portInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveBtn.click();
});
