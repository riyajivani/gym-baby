/**
 * Custom In-App Modal Dialogs (Confirmation, Prompt, Alert)
 * Eliminates native browser blocking popups (window.confirm, window.prompt, window.alert)
 */

export function showCustomConfirm({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  okText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('confirmPopupTitle');
    const msgEl = document.getElementById('confirmPopupMessage');
    const okBtn = document.getElementById('btnConfirmPopupOk');
    const cancelBtn = document.getElementById('btnConfirmPopupCancel');
    const iconBox = document.getElementById('confirmPopupIconBox');

    if (!modal || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    if (isDangerous) {
      okBtn.style.background = '#ef4444';
      okBtn.style.borderColor = '#ef4444';
      if (iconBox) {
        iconBox.className = 'custom-popup-icon-box danger';
        iconBox.style.color = '#ef4444';
        iconBox.style.background = 'rgba(239, 68, 68, 0.12)';
      }
    } else {
      okBtn.style.background = 'var(--primary)';
      okBtn.style.borderColor = 'var(--primary)';
      if (iconBox) {
        iconBox.className = 'custom-popup-icon-box info';
        iconBox.style.color = 'var(--primary)';
        iconBox.style.background = 'rgba(217, 114, 91, 0.12)';
      }
    }

    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.classList.add('active');
  });
}

export function showCustomPrompt({
  title = 'Routine Name',
  message = 'Enter the name below:',
  defaultValue = '',
  placeholder = '',
  okText = 'Save',
  cancelText = 'Cancel'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customPromptModal');
    const titleEl = document.getElementById('promptPopupTitle');
    const msgEl = document.getElementById('promptPopupMessage');
    const input = document.getElementById('promptPopupInput');
    const okBtn = document.getElementById('btnPromptPopupOk');
    const cancelBtn = document.getElementById('btnPromptPopupCancel');

    if (!modal || !input || !okBtn || !cancelBtn) {
      resolve(null);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    input.value = defaultValue;
    input.placeholder = placeholder;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
    };

    const onOk = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);
    modal.classList.add('active');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  });
}

export function showCustomAlert({
  title = 'Notice',
  message = '',
  type = 'info',
  okText = 'OK'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customAlertModal');
    const titleEl = document.getElementById('alertPopupTitle');
    const msgEl = document.getElementById('alertPopupMessage');
    const okBtn = document.getElementById('btnAlertPopupOk');
    const iconBox = document.getElementById('alertPopupIconBox');

    if (!modal || !okBtn) {
      resolve();
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    okBtn.textContent = okText;

    if (iconBox) {
      if (type === 'success') {
        iconBox.className = 'custom-popup-icon-box success';
        iconBox.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      } else if (type === 'danger' || type === 'error') {
        iconBox.className = 'custom-popup-icon-box danger';
        iconBox.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      } else {
        iconBox.className = 'custom-popup-icon-box info';
        iconBox.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      }
    }

    const onOk = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      resolve();
    };

    okBtn.addEventListener('click', onOk);
    modal.classList.add('active');
  });
}
