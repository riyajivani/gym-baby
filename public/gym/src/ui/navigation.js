/**
 * Bottom Navigation & Screen Tab Switching
 */

const tabRenderers = {};

/**
 * Registers a screen rendering callback function for a specific tab
 * @param {string} tabName - 'home' | 'workout' | 'history' | 'progress' | 'settings'
 * @param {Function} renderFn - Callback function to invoke on tab activation
 */
export function registerTabRenderer(tabName, renderFn) {
  tabRenderers[tabName] = renderFn;
}

export function initNavigation() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      switchTab(targetTab);
    });
  });
}

export function switchTab(tabName) {
  try {
    localStorage.setItem('yeshu_active_tab', tabName);
  } catch (e) {}

  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(nav => {
    nav.classList.toggle('active', nav.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) activePane.classList.add('active');

  // Trigger screen-specific refresh
  if (tabRenderers[tabName]) {
    tabRenderers[tabName]();
  }

  // Scroll to top of content
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTop = 0;
}
