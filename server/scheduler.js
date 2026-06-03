const {
  SLOT_MINUTES,
  DAY_START_HOUR,
  DAY_END_HOUR,
  getWeekStart,
  minutesToDate,
  expandEventsForWeek,
} = require('./recurrence');

const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

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

function scheduleSmartTasks(db, weekStart, now = new Date()) {
  const ws = getWeekStart(weekStart);
  const currentWeek = getWeekStart(now);
  if (ws < currentWeek) {
    return { scheduled: [], skipped: 'past_week' };
  }

  const events = db.prepare('SELECT * FROM calendar_events').all();
  const occurrences = expandEventsForWeek(events, ws);
  const grid = buildOccupancy(occurrences, ws);
  markPastSlots(grid, ws, now);

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

      const times = slotToTimes(ws, slot.dayIndex, slot.slotIndex, task.duration_minutes);
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
