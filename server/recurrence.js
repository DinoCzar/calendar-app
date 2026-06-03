const {
  DAY_MS,
  resolveWeekStartDateStr,
  weekStartMs,
  minutesToISO,
  isoToLocalMinutes,
  isoToDayIndex,
} = require('./calendarTime');

const SLOT_MINUTES = 30;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 23;
const DAY_END_MINUTE = 30;
const SLOTS_PER_DAY = ((DAY_END_HOUR * 60 + DAY_END_MINUTE) - DAY_START_HOUR * 60) / SLOT_MINUTES;

function isRecurringType(type) {
  return type === 'daily' || type === 'weekly' || type === 'weekly_days';
}

function maskIncludesDay(mask, dayIndex) {
  return Boolean(mask & (1 << dayIndex));
}

function getWeekStart(date, tzOffsetMin) {
  const dateStr = resolveWeekStartDateStr(date, tzOffsetMin);
  return new Date(weekStartMs(dateStr, tzOffsetMin));
}

function minutesToDate(weekStartDateStr, dayIndex, minutesFromMidnight, tzOffsetMin) {
  return new Date(minutesToISO(weekStartDateStr, dayIndex, minutesFromMidnight, tzOffsetMin));
}

function buildOccurrence(event, weekStartDateStr, dayIndex, recurrenceType, tzOffsetMin) {
  const start = minutesToDate(weekStartDateStr, dayIndex, event.recurrence_start_minutes, tzOffsetMin);
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
  };
}

function expandEventForWeek(event, weekStartParam, tzOffsetMin) {
  const weekStartDateStr = resolveWeekStartDateStr(weekStartParam, tzOffsetMin);
  const ws = weekStartMs(weekStartDateStr, tzOffsetMin);
  const we = ws + 7 * DAY_MS;
  const type = event.recurrence_type;

  if (type === 'daily') {
    return Array.from({ length: 7 }, (_, dayIndex) =>
      buildOccurrence(event, weekStartDateStr, dayIndex, 'daily', tzOffsetMin)
    );
  }

  if (type === 'weekly') {
    const dayIndex = event.recurrence_day_of_week;
    return [buildOccurrence(event, weekStartDateStr, dayIndex, 'weekly', tzOffsetMin)];
  }

  if (type === 'weekly_days') {
    const mask = event.recurrence_days_mask ?? 0;
    const occurrences = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      if (maskIncludesDay(mask, dayIndex)) {
        occurrences.push(buildOccurrence(event, weekStartDateStr, dayIndex, 'weekly_days', tzOffsetMin));
      }
    }
    return occurrences;
  }

  if (!event.start_time || !event.end_time) return [];

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);

  if (start.getTime() >= we || end.getTime() <= ws) return [];

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

function expandEventsForWeek(events, weekStartParam, tzOffsetMin) {
  const occurrences = [];
  for (const event of events) {
    occurrences.push(...expandEventForWeek(event, weekStartParam, tzOffsetMin));
  }
  return occurrences.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function parseOccurrenceId(id) {
  const match = String(id).match(/^(.+)-w\d+$/);
  return match ? match[1] : String(id);
}

function parseOccurrenceDayIndex(id) {
  const match = String(id).match(/-w(\d+)$/);
  return match ? Number(match[1]) : null;
}

function occurrenceToSlot(occurrence, weekStartParam, tzOffsetMin) {
  const weekStartDateStr = resolveWeekStartDateStr(weekStartParam, tzOffsetMin);
  const dayIndex = isoToDayIndex(occurrence.startTime, weekStartDateStr, tzOffsetMin);
  const localMinutes = isoToLocalMinutes(occurrence.startTime, tzOffsetMin);
  const slotIndex = Math.floor((localMinutes - DAY_START_HOUR * 60) / SLOT_MINUTES);
  const slotCount = Math.ceil(occurrence.durationMinutes / SLOT_MINUTES);
  return { dayIndex, slotIndex, slotCount };
}

module.exports = {
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  SLOTS_PER_DAY,
  isRecurringType,
  maskIncludesDay,
  getWeekStart,
  minutesToDate,
  minutesToISO,
  resolveWeekStartDateStr,
  expandEventsForWeek,
  parseOccurrenceId,
  parseOccurrenceDayIndex,
  occurrenceToSlot,
  isoToLocalMinutes,
  isoToDayIndex,
};
