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
const DAY_END_HOUR = 21;
const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

function getWeekStart(date, tzOffsetMin) {
  const dateStr = resolveWeekStartDateStr(date, tzOffsetMin);
  return new Date(weekStartMs(dateStr, tzOffsetMin));
}

function getWeekEnd(weekStartDateStr, tzOffsetMin) {
  const ws = weekStartMs(weekStartDateStr, tzOffsetMin);
  return new Date(ws + 7 * DAY_MS);
}

function minutesToDate(weekStartDateStr, dayIndex, minutesFromMidnight, tzOffsetMin) {
  return new Date(minutesToISO(weekStartDateStr, dayIndex, minutesFromMidnight, tzOffsetMin));
}

function expandEventForWeek(event, weekStartParam, tzOffsetMin) {
  const weekStartDateStr = resolveWeekStartDateStr(weekStartParam, tzOffsetMin);
  const ws = weekStartMs(weekStartDateStr, tzOffsetMin);
  const we = ws + 7 * DAY_MS;

  if (event.recurrence_type === 'weekly') {
    const dayIndex = event.recurrence_day_of_week;
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
      recurrenceType: 'weekly',
      fromSmartTaskId: event.from_smart_task_id,
    };
  }

  if (!event.start_time || !event.end_time) return null;

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);

  if (start.getTime() >= we || end.getTime() <= ws) return null;

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

function expandEventsForWeek(events, weekStartParam, tzOffsetMin) {
  const occurrences = [];
  for (const event of events) {
    const occ = expandEventForWeek(event, weekStartParam, tzOffsetMin);
    if (occ) occurrences.push(occ);
  }
  return occurrences.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function parseOccurrenceId(id) {
  const match = String(id).match(/^(.+)-w\d+$/);
  return match ? match[1] : String(id);
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
  getWeekStart,
  getWeekEnd,
  minutesToDate,
  minutesToISO,
  resolveWeekStartDateStr,
  expandEventsForWeek,
  parseOccurrenceId,
  occurrenceToSlot,
  isoToLocalMinutes,
  isoToDayIndex,
};
