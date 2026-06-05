const BACKUP_KEY = 'calendar-app-render-backup';

export function isRenderHost() {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com');
}

export function loadServerBackup() {
  if (!isRenderHost()) return null;
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveServerBackup(state, { userEdited = false } = {}) {
  if (!isRenderHost()) return;
  const previous = loadServerBackup();
  localStorage.setItem(
    BACKUP_KEY,
    JSON.stringify({
      events: state.events ?? [],
      smartTasks: state.smartTasks ?? [],
      userEdited: userEdited || previous?.userEdited || false,
      savedAt: Date.now(),
    })
  );
}

export function markServerBackupEdited() {
  const backup = loadServerBackup();
  if (!backup) return;
  saveServerBackup(backup, { userEdited: true });
}

const SEED_EVENT_IDS = new Set(['ev1']);
const SEED_TASK_IDS = new Set(['st1', 'st2', 'st3', 'st4']);

function countNonSeedEvents(events = []) {
  return events.filter((row) => !SEED_EVENT_IDS.has(row.id)).length;
}

export function shouldRestoreServerState(serverState, backup) {
  if (!backup?.userEdited) return false;

  const serverEvents = serverState?.events ?? [];
  const backupEvents = backup.events ?? [];
  const serverNonSeed = countNonSeedEvents(serverEvents);
  const backupNonSeed = countNonSeedEvents(backupEvents);

  if (backupNonSeed === 0 && backupEvents.length <= 1) return false;
  if (backupNonSeed > serverNonSeed) return true;
  if (serverEvents.length === 0 && backupEvents.length > 0) return true;

  return false;
}
