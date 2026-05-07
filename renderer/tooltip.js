// Single floating tooltip div appended to body — bypasses overflow:hidden on any ancestor.

const el = document.createElement('div');
el.id = 'app-tooltip';
document.body.appendChild(el);

let showTimer = null;

function show(text, targetRect) {
  el.textContent = text;
  el.style.opacity = '0';
  el.style.display = 'block';

  // Position below the target, centered
  const tw = el.offsetWidth;
  let left = targetRect.left + targetRect.width / 2 - tw / 2;
  let top  = targetRect.bottom + 6;

  // Flip above if too close to bottom of viewport
  if (top + el.offsetHeight > window.innerHeight - 8) {
    top = targetRect.top - el.offsetHeight - 6;
  }

  // Clamp horizontally
  left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));

  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
  el.style.opacity = '1';
}

function hide() {
  clearTimeout(showTimer);
  el.style.opacity = '0';
}

document.addEventListener('mouseover', (e) => {
  const target = e.target.closest('[data-tooltip]');
  if (!target) return;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    show(target.dataset.tooltip, target.getBoundingClientRect());
  }, 400);
});

document.addEventListener('mouseout', (e) => {
  const target = e.target.closest('[data-tooltip]');
  if (!target) return;
  // Only hide when leaving the element itself, not entering a child
  if (!target.contains(e.relatedTarget)) hide();
});

document.addEventListener('mousedown', hide);
document.addEventListener('scroll', hide, true);
