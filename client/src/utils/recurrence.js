import {
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  getWeekStart,
} from './dates';

export { getWeekStart };

function getWeekEnd(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return end;
}

export function minutesToDate(weekStart, dayIndex, minutesFromMidnight) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  d.setHours(h, m, 0, 0);
  return d;
}

export function parseOccurrenceId(id) {
  const match = String(id).match(/^(.+)-w\d+$/);
  return match ? match[1] : String(id);
}

function rowToEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    color: row.color,
    startTime: row.start_time,
    endTime: row.end_time,
    recurrenceType: row.recurrence_type,
    recurrenceDayOfWeek: row.recurrence_day_of_week,
    recurrenceStartMinutes: row.recurrence_start_minutes,
    durationMinutes: row.duration_minutes,
    fromSmartTaskId: row.from_smart_task_id,
  };
}

function expandEventForWeek(event, weekStart) {
  const ws = getWeekStart(weekStart);

  if (event.recurrence_type === 'weekly') {
    const dayIndex = event.recurrence_day_of_week;
    const start = minutesToDate(ws, dayIndex, event.recurrence_start_minutes);
    const end = new Date(start.getTime() + event.duration_minutes * 60 * 1000);
    return {
      id: `${event.id}-w${dayIndex}`,
      parentId: event.id,
      title: event.title,
      description: event.description,
      color: event.color,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: event.duration_minutes,
      recurrenceType: 'weekly',
      fromSmartTaskId: event.from_smart_task_id,
    };
  }

  if (!event.start_time || !event.end_time) return null;

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const we = getWeekEnd(ws);

  if (start >= we || end <= ws) return null;

  return {
    id: event.id,
    parentId: event.id,
    title: event.title,
    description: event.description,
    color: event.color,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes: event.duration_minutes,
    recurrenceType: 'none',
    fromSmartTaskId: event.from_smart_task_id,
  };
}

export function expandEventsForWeek(events, weekStart) {
  const occurrences = [];
  for (const event of events) {
    const occ = expandEventForWeek(event, weekStart);
    if (occ) occurrences.push(occ);
  }
  return occurrences.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

export { rowToEvent, SLOT_MINUTES, DAY_START_HOUR, DAY_END_HOUR };
