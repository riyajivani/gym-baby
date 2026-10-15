/**
 * Backup Export and Import Operations
 */

import { exportBackup, importBackup } from '../repositories/backupRepository.js';
import { appState, reloadHistory, reloadTemplates, reloadSettings } from '../state.js';
import { showCustomConfirm, showCustomAlert } from '../ui/dialogs.js';
import { renderHomeScreen } from '../ui/homeView.js';

export async function handleExportBackup() {
  try {
    const backupData = await exportBackup();
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yeshugym_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    await showCustomAlert({
      title: 'Export Failed',
      message: 'Failed to export backup data.',
      type: 'error'
    });
  }
}

export async function handleImportBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const confirmed = await showCustomConfirm({
        title: 'Restore Backup?',
        message: 'Restore this backup into IndexedDB? This will replace current workout history and templates.',
        okText: 'Restore Backup',
        isDangerous: true
      });
      if (confirmed) {
        await importBackup(parsed);
        await reloadHistory();
        await reloadTemplates();
        await reloadSettings();
        appState.activeSession = null;
        renderHomeScreen();
        await showCustomAlert({
          title: 'Import Successful',
          message: 'Backup successfully imported!',
          type: 'success'
        });
      }
    } catch (err) {
      await showCustomAlert({
        title: 'Import Error',
        message: 'Error reading JSON file: ' + err.message,
        type: 'error'
      });
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
