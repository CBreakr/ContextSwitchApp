import { store } from './store.js';
import { renderTabBar } from './components/tab-bar.js';
import { renderNavBar } from './components/nav-bar.js';
import { renderCanvas } from './components/canvas-view.js';
import { renderPalette } from './components/palette.js';
import { renderArchiveOverlay } from './components/archive-view.js';
import { hideContextMenu } from './components/context-menu.js';
import { renderSettings, showSettings } from './components/settings.js';
import './tooltip.js';

async function init() {
  await store.init();
  store.subscribe(render);

  // Reload state when main process writes it (HTTP /add endpoint)
  window.api.onExternalUpdate(() => store.reload());

  render();
}

function render() {
  const state      = store.state;
  const currentCtx = store.currentContext;

  renderTabBar(
    document.getElementById('tab-bar'),
    state.contexts,
    store.activeContextId
  );

  renderNavBar(
    document.getElementById('nav-bar'),
    store.getBreadcrumbs()
  );

  renderCanvas(
    document.getElementById('canvas-container'),
    currentCtx
  );

  renderPalette(
    document.getElementById('palette-panel'),
    state.noteTemplates
  );

  renderArchiveOverlay(
    document.getElementById('archive-overlay'),
    state.contexts
  );

  renderSettings(document.getElementById('settings-overlay'));
}

// Settings button in the tab bar spacer (injected once)
function injectSettingsButton() {
  const btn = document.createElement('button');
  btn.className = 'tab-bar-settings-btn';
  btn.title = 'Settings';
  btn.dataset.tooltip = 'Settings';
  btn.textContent = '⚙';
  btn.addEventListener('click', showSettings);
  // Insert into tab-bar spacer after it's rendered
  const observer = new MutationObserver(() => {
    const spacer = document.querySelector('.tab-bar-spacer');
    if (spacer && !spacer.querySelector('.tab-bar-settings-btn')) {
      spacer.appendChild(btn.cloneNode(true));
      spacer.querySelector('.tab-bar-settings-btn').addEventListener('click', showSettings);
    }
  });
  observer.observe(document.getElementById('tab-bar'), { childList: true, subtree: true });
}

document.addEventListener('mousedown', (e) => {
  const menu = document.getElementById('context-menu');
  if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideContextMenu();
});

injectSettingsButton();
init();
