const menuEl = () => document.getElementById('context-menu');

export function showContextMenu(x, y, items) {
  const menu = menuEl();
  menu.innerHTML = '';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    if (item.danger) btn.classList.add('context-menu-item-danger');
    if (item.disabled) btn.classList.add('context-menu-item-disabled');
    btn.textContent = item.label;
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (!item.disabled) {
        hideContextMenu();
        item.action();
      }
    });
    menu.appendChild(btn);
  }

  // Position, keeping within viewport
  menu.classList.remove('hidden');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = menu.offsetWidth || 180;
  const mh = menu.offsetHeight || items.length * 30;
  const clampedX = Math.min(x, vw - mw - 8);
  const clampedY = Math.min(y, vh - mh - 8);
  menu.style.left = clampedX + 'px';
  menu.style.top  = clampedY + 'px';
}

export function hideContextMenu() {
  menuEl().classList.add('hidden');
}
