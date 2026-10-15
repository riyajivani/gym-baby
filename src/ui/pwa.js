/**
 * PWA & Network Connectivity Management
 */

let deferredInstallPrompt = null;

export function initNetworkAndPwaStatus() {
  const offlineBadge = document.getElementById('offlineStatusBadge');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');

  const updateOnlineState = () => {
    if (!navigator.onLine) {
      if (offlineBadge) offlineBadge.style.display = 'inline-flex';
    } else {
      if (offlineBadge) offlineBadge.style.display = 'none';
    }
  };

  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  updateOnlineState();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaInstallBtn) pwaInstallBtn.style.display = 'block';
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          pwaInstallBtn.style.display = 'none';
        }
        deferredInstallPrompt = null;
      }
    });
  }
}
