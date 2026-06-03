import {
  DAY_NAMES,
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  getWeekStart,
} from './dates';

export { getWeekStart };

export function isRecurringType(type) {
  return type === 'daily' || type === 'weekly' || type === 'weekly_days';
}

export function dayIndexToMask(dayIndex) {
  return 1 << dayIndex;
}

export function maskIncludesDay(mask, dayIndex) {
  return Boolean(mask & (1 << dayIndex));
}

export function toggleMaskDay(mask, dayIndex) {
  return mask ^ (1 << dayIndex);
}

export function maskToDayIndices(mask) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(i);
  }
  return days;
}

export function formatDaysMask(mask) {
  const indices = maskToDayIndices(mask ?? 0);
  if (indices.length === 0) return '';
  return indices.map((i) => DAY_NAMES[i]).join(', ');
}

export function formatRecurrenceLabel(recurrenceType, recurrenceDaysMask) {
  switch (recurrenceType) {
    case 'daily':
      return ' · Daily';
    case 'weekly':
      return ' · Weekly';
    case 'weekly_days': {
      const days = formatDaysMask(recurrenceDaysMask);
      return days ? ` · ${days}` : ' · Custom';
    }
    default:
      return '';
  }
}

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

export function parseOccurrenceDayIndex(id) {
  const match = String(id).match(/-w(\d+)$/);
  return match ? Number(match[1]) : null;
}

function buildOccurrence(event, weekStart, dayIndex, recurrenceType, extra = {}) {
  const start = minutesToDate(weekStart, dayIndex, event.recurrence_start_minutes);
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
    recurrenceType,
    recurrenceDaysMask: event.recurrence_days_mask ?? null,
    fromSmartTaskId: event.from_smart_task_id,
    ...extra,
  };
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
    recurrenceDaysMask: row.recurrence_days_mask,
    recurrenceStartMinutes: row.recurrence_start_minutes,
    durationMinutes: row.duration_minutes,
    fromSmartTaskId: row.from_smart_task_id,
  };
}

function expandEventForWeek(event, weekStart) {
  const ws = getWeekStart(weekStart);
  const type = event.recurrence_type;

  if (type === 'daily') {
    return Array.from({ length: 7 }, (_, dayIndex) =>
      buildOccurrence(event, ws, dayIndex, 'daily')
    );
  }

  if (type === 'weekly') {
    const dayIndex = event.recurrence_day_of_week;
    return [buildOccurrence(event, ws, dayIndex, 'weekly')];
  }

  if (type === 'weekly_days') {
    const mask = event.recurrence_days_mask ?? 0;
    const occurrences = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      if (maskIncludesDay(mask, dayIndex)) {
        occurrences.push(buildOccurrence(event, ws, dayIndex, 'weekly_days'));
      }
    }
    return occurrences;
  }

  if (!event.start_time || !event.end_time) return [];

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const we = getWeekEnd(ws);

  if (start >= we || end <= ws) return [];

  return [{
    id: event.id,
    parentId: event.id,
    title: event.title,
    description: event.description,
    color: event.color,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes: event.duration_minutes,
    recurrenceType: 'none',
    recurrenceDaysMask: null,
    fromSmartTaskId: event.from_smart_task_id,
  }];
}

export function expandEventsForWeek(events, weekStart) {
  const occurrences = [];
  for (const event of events) {
    occurrences.push(...expandEventForWeek(event, weekStart));
  }
  return occurrences.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

export { rowToEvent, SLOT_MINUTES, DAY_START_HOUR, DAY_END_HOUR };
