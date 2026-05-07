import { store } from '../store.js';

export function renderNavBar(container, crumbs) {
  container.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'nav-bar';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'nav-back-btn';
  backBtn.textContent = '‹';
  backBtn.title = 'Back';
  backBtn.dataset.tooltip = 'Back';
  const canGoBack = crumbs.length > 1;
  if (!canGoBack) backBtn.disabled = true;
  backBtn.addEventListener('click', () => store.navigateBack());
  bar.appendChild(backBtn);

  // Breadcrumb trail
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'nav-breadcrumb';

  crumbs.forEach((crumb, i) => {
    const isLast = i === crumbs.length - 1;

    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'nav-breadcrumb-sep';
      sep.textContent = '›';
      breadcrumb.appendChild(sep);
    }

    if (isLast) {
      const current = document.createElement('span');
      current.className = 'nav-breadcrumb-current';
      current.textContent = crumb.name;
      breadcrumb.appendChild(current);
    } else {
      const link = document.createElement('button');
      link.className = 'nav-breadcrumb-link';
      link.textContent = crumb.name;
      link.addEventListener('click', () => store.navigateTo(crumb.id));
      breadcrumb.appendChild(link);
    }
  });

  bar.appendChild(breadcrumb);
  container.appendChild(bar);
}
