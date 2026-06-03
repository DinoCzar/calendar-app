import {
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  getWeekStart,
  expandEventsForWeek,
  minutesToDate,
  parseOccurrenceId,
  rowToEvent,
} from './utils/recurrence';

const STORAGE_KEY = 'calendar-app-data';
const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

function defaultData() {
  return {
    smartTasks: [
      { id: 'st1', title: 'Pay Bills', description: 'Monthly utilities', duration_minutes: 30, priority: 0, status: 'pending', scheduled_event_id: null },
      { id: 'st2', title: 'Grocery Shopping', description: '', duration_minutes: 60, priority: 1, status: 'pending', scheduled_event_id: null },
      { id: 'st3', title: 'Call Accountant', description: 'Tax prep', duration_minutes: 30, priority: 2, status: 'pending', scheduled_event_id: null },
      { id: 'st4', title: 'Clean Garage', description: '', duration_minutes: 90, priority: 3, status: 'pending', scheduled_event_id: null },
    ],
    events: [
      {
        id: 'ev1',
        title: 'Team Standup',
        description: 'Daily sync',
        color: '#5856D6',
        start_time: null,
        end_time: null,
        recurrence_type: 'weekly',
        recurrence_day_of_week: 0,
        recurrence_start_minutes: 9 * 60,
        duration_minutes: 30,
        from_smart_task_id: null,
      },
    ],
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const data = defaultData();
      saveData(data);
      return data;
    }
    return JSON.parse(raw);
  } catch {
    const data = defaultData();
    saveData(data);
    return data;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function rowToSmartTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priority: row.priority,
    status: row.status,
    scheduledEventId: row.scheduled_event_id,
  };
}

function blockSlots(grid, dayIndex, slotIndex, slotCount) {
  for (let i = 0; i < slotCount; i++) {
    const s = slotIndex + i;
    if (dayIndex >= 0 && dayIndex < 7 && s >= 0 && s < SLOTS_PER_DAY) {
      grid[dayIndex][s] = true;
    }
  }
}

function buildOccupancy(occurrences, weekStart) {
  const ws = getWeekStart(weekStart);
  const grid = Array.from({ length: 7 }, () => Array(SLOTS_PER_DAY).fill(false));

  for (const occ of occurrences) {
    const start = new Date(occ.startTime);
    const dayIndex = Math.floor((start - ws) / (24 * 60 * 60 * 1000));
    const totalMinutes = start.getHours() * 60 + start.getMinutes() - DAY_START_HOUR * 60;
    const slotIndex = Math.floor(totalMinutes / SLOT_MINUTES);
    const slotCount = Math.ceil(occ.durationMinutes / SLOT_MINUTES);
    blockSlots(grid, dayIndex, slotIndex, slotCount);
  }

  return grid;
}

function findFirstSlot(grid, durationMinutes) {
  const slotsNeeded = Math.ceil(durationMinutes / SLOT_MINUTES);

  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot <= SLOTS_PER_DAY - slotsNeeded; slot++) {
      let fits = true;
      for (let i = 0; i < slotsNeeded; i++) {
        if (grid[day][slot + i]) {
          fits = false;
          break;
        }
      }
      if (fits) return { dayIndex: day, slotIndex: slot };
    }
  }
  return null;
}

function slotToTimes(weekStart, dayIndex, slotIndex, durationMinutes) {
  const ws = getWeekStart(weekStart);
  const startMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const start = minutesToDate(ws, dayIndex, startMinutes);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function markPastSlots(grid, weekStart, now) {
  const ws = getWeekStart(weekStart);
  const currentWeek = getWeekStart(now);

  if (ws.getTime() !== currentWeek.getTime()) return;

  const todayIndex = Math.floor((now - ws) / (24 * 60 * 60 * 1000));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowSlot = Math.ceil((nowMinutes - DAY_START_HOUR * 60) / SLOT_MINUTES);

  for (let day = 0; day < 7; day++) {
    if (day < todayIndex) {
      for (let slot = 0; slot < SLOTS_PER_DAY; slot++) grid[day][slot] = true;
    } else if (day === todayIndex && nowSlot > 0) {
      for (let slot = 0; slot < Math.min(nowSlot, SLOTS_PER_DAY); slot++) {
        grid[day][slot] = true;
      }
    }
  }
}

function scheduleTasks(data, weekStart, now = new Date()) {
  const ws = getWeekStart(weekStart);
  const currentWeek = getWeekStart(now);
  if (ws < currentWeek) {
    return { scheduled: [] };
  }

  const occurrences = expandEventsForWeek(data.events, ws);
  const grid = buildOccupancy(occurrences, ws);
  markPastSlots(grid, ws, now);

  const pending = data.smartTasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => a.priority - b.priority);

  const scheduled = [];

  for (const task of pending) {
    const slot = findFirstSlot(grid, task.duration_minutes);
    if (!slot) break;

    const times = slotToTimes(ws, slot.dayIndex, slot.slotIndex, task.duration_minutes);
    const eventId = crypto.randomUUID();

    data.events.push({
      id: eventId,
      title: task.title,
      description: task.description || '',
      color: '#34C759',
      start_time: times.startTime,
      end_time: times.endTime,
      recurrence_type: 'none',
      recurrence_day_of_week: null,
      recurrence_start_minutes: null,
      duration_minutes: task.duration_minutes,
      from_smart_task_id: task.id,
    });

    task.status = 'scheduled';
    task.scheduled_event_id = eventId;

    const slotCount = Math.ceil(task.duration_minutes / SLOT_MINUTES);
    blockSlots(grid, slot.dayIndex, slot.slotIndex, slotCount);

    scheduled.push({ smartTaskId: task.id, eventId, ...times });
  }

  return { scheduled };
}

export function fetchWeek(weekStart) {
  const data = loadData();
  const ws = getWeekStart(weekStart ? new Date(weekStart) : new Date());
  return Promise.resolve({
    weekStart: ws.toISOString(),
    now: new Date().toISOString(),
    events: expandEventsForWeek(data.events, ws),
  });
}

export function fetchSmartTasks() {
  const data = loadData();
  return Promise.resolve(
    data.smartTasks
      .filter((t) => t.status === 'pending')
      .sort((a, b) => a.priority - b.priority)
      .map(rowToSmartTask)
  );
}

export function createSmartTask({ title = 'New task', description = '', durationMinutes = 30 }) {
  const data = loadData();
  const maxPri = data.smartTasks.reduce((m, t) => Math.max(m, t.priority), -1);
  const row = {
    id: crypto.randomUUID(),
    title,
    description,
    duration_minutes: durationMinutes,
    priority: maxPri + 1,
    status: 'pending',
    scheduled_event_id: null,
  };
  data.smartTasks.push(row);
  saveData(data);
  return Promise.resolve(rowToSmartTask(row));
}

export function updateSmartTask(id, { title, description, durationMinutes }) {
  const data = loadData();
  const row = data.smartTasks.find((t) => t.id === id);
  if (!row) return Promise.reject(new Error('Not found'));
  if (title !== undefined) row.title = title;
  if (description !== undefined) row.description = description;
  if (durationMinutes !== undefined) row.duration_minutes = durationMinutes;
  saveData(data);
  return Promise.resolve(rowToSmartTask(row));
}

export function deleteSmartTask(id) {
  const data = loadData();
  const before = data.smartTasks.length;
  data.smartTasks = data.smartTasks.filter((t) => t.id !== id);
  if (data.smartTasks.length === before) return Promise.reject(new Error('Not found'));
  saveData(data);
  return Promise.resolve(null);
}

export function reorderSmartTasks(orderedIds) {
  const data = loadData();
  orderedIds.forEach((id, index) => {
    const row = data.smartTasks.find((t) => t.id === id);
    if (row) row.priority = index;
  });
  saveData(data);
  return fetchSmartTasks();
}

export function scheduleSmartTasks(weekStart) {
  const data = loadData();
  const ws = getWeekStart(new Date(weekStart));
  scheduleTasks(data, ws);
  saveData(data);
  return Promise.resolve({
    scheduled: [],
    weekStart: ws.toISOString(),
    events: expandEventsForWeek(data.events, ws),
    smartTasks: data.smartTasks
      .filter((t) => t.status === 'pending')
      .sort((a, b) => a.priority - b.priority)
      .map(rowToSmartTask),
  });
}

export function createEvent({
  title = 'New event',
  description = '',
  color = '#007AFF',
  startTime,
  endTime,
  durationMinutes = 60,
  recurrenceType = 'none',
  recurrenceDayOfWeek,
  recurrenceStartMinutes,
}) {
  const data = loadData();
  const id = crypto.randomUUID();
  const row = {
    id,
    title,
    description,
    color,
    start_time: recurrenceType === 'weekly' ? null : startTime,
    end_time: recurrenceType === 'weekly' ? null : endTime,
    recurrence_type: recurrenceType === 'weekly' ? 'weekly' : 'none',
    recurrence_day_of_week: recurrenceType === 'weekly' ? recurrenceDayOfWeek : null,
    recurrence_start_minutes: recurrenceType === 'weekly' ? recurrenceStartMinutes : null,
    duration_minutes: durationMinutes,
    from_smart_task_id: null,
  };
  data.events.push(row);
  saveData(data);
  return Promise.resolve(rowToEvent(row));
}

export function updateEvent(id, patch) {
  const data = loadData();
  const parentId = parseOccurrenceId(id);
  const row = data.events.find((e) => e.id === parentId);
  if (!row) return Promise.reject(new Error('Not found'));

  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.color !== undefined) row.color = patch.color;

  if (row.recurrence_type === 'weekly') {
    if (patch.recurrenceDayOfWeek !== undefined) row.recurrence_day_of_week = patch.recurrenceDayOfWeek;
    if (patch.recurrenceStartMinutes !== undefined) row.recurrence_start_minutes = patch.recurrenceStartMinutes;
    if (patch.durationMinutes !== undefined) row.duration_minutes = patch.durationMinutes;
  } else {
    if (patch.startTime !== undefined) row.start_time = patch.startTime;
    if (patch.endTime !== undefined) row.end_time = patch.endTime;
    if (patch.durationMinutes !== undefined) row.duration_minutes = patch.durationMinutes;
  }

  saveData(data);
  return Promise.resolve(rowToEvent(row));
}

export function moveEvent(id, { weekStart, dayIndex, slotIndex, durationMinutes }) {
  const data = loadData();
  const parentId = parseOccurrenceId(id);
  const row = data.events.find((e) => e.id === parentId);
  if (!row) return Promise.reject(new Error('Not found'));

  const ws = getWeekStart(new Date(weekStart));
  const startMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const dur = durationMinutes ?? row.duration_minutes;
  const start = minutesToDate(ws, dayIndex, startMinutes);
  const end = new Date(start.getTime() + dur * 60 * 1000);

  if (row.recurrence_type === 'weekly') {
    row.recurrence_day_of_week = dayIndex;
    row.recurrence_start_minutes = startMinutes;
    row.duration_minutes = dur;
  } else {
    row.start_time = start.toISOString();
    row.end_time = end.toISOString();
    row.duration_minutes = dur;
  }

  saveData(data);
  const updated = rowToEvent(row);
  return Promise.resolve({
    event: updated,
    occurrence: expandEventsForWeek([row], ws).find((o) => o.parentId === parentId),
  });
}

export function deleteEvent(id) {
  const data = loadData();
  const parentId = parseOccurrenceId(id);
  const row = data.events.find((e) => e.id === parentId);
  if (!row) return Promise.reject(new Error('Not found'));

  if (row.from_smart_task_id) {
    const task = data.smartTasks.find((t) => t.id === row.from_smart_task_id);
    if (task) {
      task.status = 'pending';
      task.scheduled_event_id = null;
    }
  }

  data.events = data.events.filter((e) => e.id !== parentId);
  saveData(data);
  return Promise.resolve(null);
}
