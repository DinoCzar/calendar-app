const {
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  getWeekStart,
  resolveWeekStartDateStr,
  expandEventsForWeek,
  occurrenceToSlot,
  minutesToISO,
  isoToLocalMinutes,
  isoToDayIndex,
} = require('./recurrence');
const { getWeekStartDateStr } = require('./calendarTime');

const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

function blockSlots(grid, dayIndex, slotIndex, slotCount) {
  for (let i = 0; i < slotCount; i++) {
    const s = slotIndex + i;
    if (dayIndex >= 0 && dayIndex < 7 && s >= 0 && s < SLOTS_PER_DAY) {
      grid[dayIndex][s] = true;
    }
  }
}

function buildOccupancy(occurrences, weekStartParam, tzOffsetMin) {
  const grid = Array.from({ length: 7 }, () => Array(SLOTS_PER_DAY).fill(false));

  for (const occ of occurrences) {
    const { dayIndex, slotIndex, slotCount } = occurrenceToSlot(occ, weekStartParam, tzOffsetMin);
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

function slotToTimes(weekStartParam, dayIndex, slotIndex, durationMinutes, tzOffsetMin) {
  const weekStartDateStr = resolveWeekStartDateStr(weekStartParam, tzOffsetMin);
  const startMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const startTime = minutesToISO(weekStartDateStr, dayIndex, startMinutes, tzOffsetMin);
  const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60 * 1000).toISOString();
  return { startTime, endTime };
}

function markPastSlots(grid, weekStartParam, now, tzOffsetMin) {
  const weekStartDateStr = resolveWeekStartDateStr(weekStartParam, tzOffsetMin);
  const currentWeekDateStr = getWeekStartDateStr(now, tzOffsetMin);

  if (weekStartDateStr !== currentWeekDateStr) return;

  const todayIndex = isoToDayIndex(now.toISOString(), weekStartDateStr, tzOffsetMin);
  const nowMinutes = isoToLocalMinutes(now.toISOString(), tzOffsetMin);
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

function scheduleSmartTasks(db, weekStartParam, tzOffsetMin, now = new Date()) {
  const ws = getWeekStart(weekStartParam, tzOffsetMin);
  const currentWeek = getWeekStart(now, tzOffsetMin);
  if (ws.getTime() < currentWeek.getTime()) {
    return { scheduled: [], skipped: 'past_week' };
  }

  const events = db.prepare('SELECT * FROM calendar_events').all();
  const occurrences = expandEventsForWeek(events, weekStartParam, tzOffsetMin);
  const grid = buildOccupancy(occurrences, weekStartParam, tzOffsetMin);
  markPastSlots(grid, weekStartParam, now, tzOffsetMin);

  const pending = db
    .prepare('SELECT * FROM smart_tasks WHERE status = ? ORDER BY priority ASC')
    .all('pending');

  const scheduled = [];
  const insertEvent = db.prepare(`
    INSERT INTO calendar_events (
      id, title, description, color, start_time, end_time,
      recurrence_type, duration_minutes, from_smart_task_id
    ) VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?)
  `);
  const updateSmart = db.prepare(`
    UPDATE smart_tasks SET status = 'scheduled', scheduled_event_id = ? WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const task of pending) {
      const slot = findFirstSlot(grid, task.duration_minutes);
      if (!slot) break;

      const times = slotToTimes(weekStartParam, slot.dayIndex, slot.slotIndex, task.duration_minutes, tzOffsetMin);
      const eventId = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      insertEvent.run(
        eventId,
        task.title,
        task.description || '',
        '#34C759',
        times.startTime,
        times.endTime,
        task.duration_minutes,
        task.id
      );
      updateSmart.run(eventId, task.id);

      const slotCount = Math.ceil(task.duration_minutes / SLOT_MINUTES);
      blockSlots(grid, slot.dayIndex, slot.slotIndex, slotCount);

      scheduled.push({ smartTaskId: task.id, eventId, ...times });
    }
  });

  tx();
  return { scheduled };
}

module.exports = {
  buildOccupancy,
  findFirstSlot,
  slotToTimes,
  scheduleSmartTasks,
  SLOTS_PER_DAY,
};
