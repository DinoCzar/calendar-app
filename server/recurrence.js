const SLOT_MINUTES = 30;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekEnd(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return end;
}

function minutesToDate(weekStart, dayIndex, minutesFromMidnight) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
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

function expandEventsForWeek(events, weekStart) {
  const occurrences = [];
  for (const event of events) {
    const occ = expandEventForWeek(event, weekStart);
    if (occ) occurrences.push(occ);
  }
  return occurrences.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function parseOccurrenceId(id) {
  const match = String(id).match(/^(.+)-w\d+$/);
  return match ? match[1] : String(id);
}

module.exports = {
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  getWeekStart,
  getWeekEnd,
  minutesToDate,
  dateToMinutes,
  expandEventsForWeek,
  parseOccurrenceId,
};
