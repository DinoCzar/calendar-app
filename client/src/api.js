import * as localStore from './localStore';
import { getWeekStart, toDateInputValue } from './utils/dates';
import {
  isRenderHost,
  loadServerBackup,
  saveServerBackup,
  shouldRestoreServerState,
} from './serverBackup';

const BASE = '/api';

function isGitHubPagesHost() {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
}

const useLocal =
  import.meta.env.VITE_USE_LOCAL_API === 'true' || isGitHubPagesHost();

function tzOffset() {
  return new Date().getTimezoneOffset();
}

function weekStartDate(weekStart) {
  return toDateInputValue(weekStart ? getWeekStart(new Date(weekStart)) : getWeekStart());
}

function withTz(params = {}) {
  return { ...params, tzOffset: String(tzOffset()) };
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchAppState() {
  return request('/state');
}

async function restoreAppState(state) {
  return request('/state', {
    method: 'POST',
    body: JSON.stringify({
      events: state.events,
      smartTasks: state.smartTasks,
    }),
  });
}

async function syncBackupFromServer({ userEdited = false } = {}) {
  if (useLocal || !isRenderHost()) return;
  const state = await fetchAppState();
  const previous = loadServerBackup();
  saveServerBackup(state, { userEdited: userEdited || previous?.userEdited || false });
}

async function syncBackupAfterEdit() {
  await syncBackupFromServer({ userEdited: true });
}

export async function ensureServerStateRestored() {
  if (useLocal || !isRenderHost()) return;

  const serverState = await fetchAppState();
  const backup = loadServerBackup();

  if (shouldRestoreServerState(serverState, backup)) {
    await restoreAppState(backup);
    return;
  }

  if ((serverState.events?.length ?? 0) > 0 || backup?.userEdited) {
    saveServerBackup(serverState, { userEdited: backup?.userEdited ?? false });
  }
}

function withBackup(fn) {
  return async (...args) => {
    const result = await fn(...args);
    await syncBackupAfterEdit();
    return result;
  };
}

export const fetchWeek = useLocal
  ? localStore.fetchWeek
  : (weekStart) => {
      const q = new URLSearchParams(withTz({ weekStart: weekStartDate(weekStart) })).toString();
      return request(`/week?${q}`);
    };

export const fetchSmartTasks = useLocal
  ? localStore.fetchSmartTasks
  : () => request('/smart-tasks');

export const createSmartTask = useLocal
  ? localStore.createSmartTask
  : withBackup((data) => request('/smart-tasks', { method: 'POST', body: JSON.stringify(data) }));

export const updateSmartTask = useLocal
  ? localStore.updateSmartTask
  : withBackup((id, data) => request(`/smart-tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }));

export const deleteSmartTask = useLocal
  ? localStore.deleteSmartTask
  : withBackup((id) => request(`/smart-tasks/${id}`, { method: 'DELETE' }));

export const reorderSmartTasks = useLocal
  ? localStore.reorderSmartTasks
  : withBackup((orderedIds) =>
      request('/smart-tasks/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds }),
      }));

export const scheduleSmartTasks = useLocal
  ? localStore.scheduleSmartTasks
  : withBackup((weekStart) =>
      request('/smart-tasks/schedule', {
        method: 'POST',
        body: JSON.stringify(withTz({ weekStart: weekStartDate(weekStart) })),
      }));

export const recallSmartTasks = useLocal
  ? localStore.recallSmartTasks
  : withBackup((weekStart) =>
      request('/smart-tasks/recall', {
        method: 'POST',
        body: JSON.stringify(withTz({ weekStart: weekStartDate(weekStart) })),
      }));

export const createEvent = useLocal
  ? localStore.createEvent
  : withBackup((data) => request('/events', { method: 'POST', body: JSON.stringify(data) }));

export const updateEvent = useLocal
  ? localStore.updateEvent
  : withBackup((id, data) => request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }));

export const moveEvent = useLocal
  ? localStore.moveEvent
  : withBackup((id, data) =>
      request(`/events/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          weekStart: weekStartDate(data.weekStart),
          tzOffset: tzOffset(),
        }),
      }));

export const deleteEvent = useLocal
  ? localStore.deleteEvent
  : withBackup((id) => request(`/events/${id}`, { method: 'DELETE' }));
