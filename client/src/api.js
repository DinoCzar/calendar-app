import * as localStore from './localStore';

const BASE = '/api';
const useLocal = import.meta.env.VITE_USE_LOCAL_API === 'true';

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

export const fetchWeek = useLocal
  ? localStore.fetchWeek
  : (weekStart) => {
      const q = weekStart ? `?weekStart=${encodeURIComponent(new Date(weekStart).toISOString())}` : '';
      return request(`/week${q}`);
    };

export const fetchSmartTasks = useLocal
  ? localStore.fetchSmartTasks
  : () => request('/smart-tasks');

export const createSmartTask = useLocal
  ? localStore.createSmartTask
  : (data) => request('/smart-tasks', { method: 'POST', body: JSON.stringify(data) });

export const updateSmartTask = useLocal
  ? localStore.updateSmartTask
  : (id, data) => request(`/smart-tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const deleteSmartTask = useLocal
  ? localStore.deleteSmartTask
  : (id) => request(`/smart-tasks/${id}`, { method: 'DELETE' });

export const reorderSmartTasks = useLocal
  ? localStore.reorderSmartTasks
  : (orderedIds) =>
      request('/smart-tasks/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds }),
      });

export const scheduleSmartTasks = useLocal
  ? localStore.scheduleSmartTasks
  : (weekStart) =>
      request('/smart-tasks/schedule', {
        method: 'POST',
        body: JSON.stringify({ weekStart: new Date(weekStart).toISOString() }),
      });

export const createEvent = useLocal
  ? localStore.createEvent
  : (data) => request('/events', { method: 'POST', body: JSON.stringify(data) });

export const updateEvent = useLocal
  ? localStore.updateEvent
  : (id, data) => request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const moveEvent = useLocal
  ? localStore.moveEvent
  : (id, data) => request(`/events/${id}/move`, { method: 'POST', body: JSON.stringify(data) });

export const deleteEvent = useLocal
  ? localStore.deleteEvent
  : (id) => request(`/events/${id}`, { method: 'DELETE' });
