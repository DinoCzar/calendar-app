const BASE = '/api';

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

export function fetchWeek(weekStart) {
  const q = weekStart ? `?weekStart=${encodeURIComponent(new Date(weekStart).toISOString())}` : '';
  return request(`/week${q}`);
}

export function fetchSmartTasks() {
  return request('/smart-tasks');
}

export function createSmartTask(data) {
  return request('/smart-tasks', { method: 'POST', body: JSON.stringify(data) });
}

export function updateSmartTask(id, data) {
  return request(`/smart-tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteSmartTask(id) {
  return request(`/smart-tasks/${id}`, { method: 'DELETE' });
}

export function reorderSmartTasks(orderedIds) {
  return request('/smart-tasks/reorder', {
    method: 'PUT',
    body: JSON.stringify({ orderedIds }),
  });
}

export function scheduleSmartTasks(weekStart) {
  return request('/smart-tasks/schedule', {
    method: 'POST',
    body: JSON.stringify({ weekStart: new Date(weekStart).toISOString() }),
  });
}

export function createEvent(data) {
  return request('/events', { method: 'POST', body: JSON.stringify(data) });
}

export function updateEvent(id, data) {
  return request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function moveEvent(id, data) {
  return request(`/events/${id}/move`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteEvent(id) {
  return request(`/events/${id}`, { method: 'DELETE' });
}
