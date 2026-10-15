/**
 * Custom In-App Dropdown Picker
 * Replaces ugly native full-screen mobile pickers and giant system wheels with a sleek in-app bottom sheet.
 */

const TITLES = {
  homeTemplateSelect: 'Select Workout Routine',
  weekStartSelect: 'Week Starts On',
  routineMgrSelect: 'Manage Routine',
  workoutEmptyRoutineSelect: 'Select Workout Routine',
  routineExCategorySelect: 'Muscle Category',
  newExCategory: 'Muscle Category'
};

let activeSelect = null;
let lastOpenTime = 0;

export function initCustomSelects() {
  const modal = document.getElementById('customSelectPickerModal');
  const closeBtn = document.getElementById('btnCloseCustomPicker');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', closeCustomPicker);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeCustomPicker();
      }
    });
  }

  // Escape key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeCustomPicker();
    }
  });

  // Intercept all select elements in document
  const bindSelect = (select) => {
    if (select.dataset.customPickerBound) return;
    select.dataset.customPickerBound = 'true';

    const handleOpen = (e) => {
      e.preventDefault();
      e.stopPropagation();
      select.blur();
      const now = Date.now();
      if (now - lastOpenTime < 300) return;
      lastOpenTime = now;
      openCustomSelectPicker(select);
    };

    select.addEventListener('pointerdown', handleOpen);
    select.addEventListener('mousedown', handleOpen);
    select.addEventListener('touchstart', handleOpen, { passive: false });
    select.addEventListener('click', handleOpen);

    select.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openCustomSelectPicker(select);
      }
    });
  };

  document.querySelectorAll('select').forEach(bindSelect);

  // Observer for dynamically created or updated selects
  const observer = new MutationObserver(() => {
    document.querySelectorAll('select').forEach(bindSelect);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function openCustomSelectPicker(selectEl) {
  if (!selectEl) return;
  activeSelect = selectEl;

  const modal = document.getElementById('customSelectPickerModal');
  const titleEl = document.getElementById('customPickerTitle');
  const container = document.getElementById('customPickerOptionsContainer');

  if (!modal || !container) return;

  const title = TITLES[selectEl.id] ||
    selectEl.getAttribute('aria-label') ||
    selectEl.closest('.form-group')?.querySelector('label')?.textContent?.trim() ||
    selectEl.closest('.settings-item-row')?.querySelector('.settings-title')?.textContent?.trim() ||
    'Select Option';

  if (titleEl) titleEl.textContent = title;

  container.innerHTML = '';

  const options = Array.from(selectEl.options);
  if (options.length === 0) {
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No options available</div>';
  }

  let selectedItemEl = null;

  options.forEach((opt) => {
    const isSelected = opt.value === selectEl.value;
    const item = document.createElement('button');
    item.className = `custom-picker-item ${isSelected ? 'selected' : ''}`;
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    item.innerHTML = `
      <span class="picker-item-label">${opt.textContent}</span>
      <span class="picker-check">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    `;

    if (isSelected) {
      selectedItemEl = item;
    }

    item.addEventListener('click', () => {
      if (selectEl.value !== opt.value) {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeCustomPicker();
    });

    container.appendChild(item);
  });

  modal.classList.add('active');

  // Scroll selected into view
  if (selectedItemEl) {
    setTimeout(() => {
      selectedItemEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 40);
  }
}

export function closeCustomPicker() {
  const modal = document.getElementById('customSelectPickerModal');
  if (modal) modal.classList.remove('active');
  activeSelect = null;
}
