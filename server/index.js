const express = require('express');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('./db');
const {
  expandEventsForWeek,
  parseOccurrenceId,
  parseOccurrenceDayIndex,
  resolveWeekStartDateStr,
  minutesToISO,
  isRecurringType,
  DAY_START_HOUR,
  SLOT_MINUTES,
} = require('./recurrence');
const { parseTzOffset, weekStartMs } = require('./calendarTime');
const { scheduleSmartTasks, recallSmartTasks } = require('./scheduler');

function tzFromReq(req) {
  return parseTzOffset(req.query.tzOffset ?? req.body?.tzOffset);
}

function weekStartPayload(weekStartDateStr, tzOffsetMin) {
  return {
    weekStart: weekStartDateStr,
    weekStartTime: new Date(weekStartMs(weekStartDateStr, tzOffsetMin)).toISOString(),
  };
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
    commit: process.env.RENDER_GIT_COMMIT || null,
    databasePath: process.env.DATABASE_PATH || null,
  });
});

app.get('/api/state', (_req, res) => {
  res.json({
    events: db.prepare('SELECT * FROM calendar_events').all(),
    smartTasks: db.prepare('SELECT * FROM smart_tasks ORDER BY priority ASC').all(),
  });
});

app.post('/api/state', (req, res) => {
  const { events, smartTasks } = req.body;
  if (!Array.isArray(events) || !Array.isArray(smartTasks)) {
    return res.status(400).json({ error: 'events and smartTasks arrays required' });
  }

  const insertEvent = db.prepare(`
    INSERT INTO calendar_events (
      id, title, description, color, start_time, end_time, recurrence_type,
      recurrence_day_of_week, recurrence_start_minutes, recurrence_days_mask,
      duration_minutes, from_smart_task_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTask = db.prepare(`
    INSERT INTO smart_tasks (
      id, title, description, duration_minutes, priority, status, scheduled_event_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM calendar_events').run();
    db.prepare('DELETE FROM smart_tasks').run();

    for (const row of events) {
      insertEvent.run(
        row.id,
        row.title,
        row.description ?? '',
        row.color ?? '#007AFF',
        row.start_time ?? null,
        row.end_time ?? null,
        row.recurrence_type ?? 'none',
        row.recurrence_day_of_week ?? null,
        row.recurrence_start_minutes ?? null,
        row.recurrence_days_mask ?? null,
        row.duration_minutes,
        row.from_smart_task_id ?? null,
        row.created_at ?? null
      );
    }

    for (const row of smartTasks) {
      insertTask.run(
        row.id,
        row.title,
        row.description ?? '',
        row.duration_minutes,
        row.priority,
        row.status ?? 'pending',
        row.scheduled_event_id ?? null,
        row.created_at ?? null
      );
    }
  });

  tx();
  res.json({ ok: true });
});

app.get('/api/week', (req, res) => {
  const tzOffsetMin = tzFromReq(req);
  const weekStartDateStr = resolveWeekStartDateStr(req.query.weekStart, tzOffsetMin);
  const rows = db.prepare('SELECT * FROM calendar_events').all();
  const events = expandEventsForWeek(rows, weekStartDateStr, tzOffsetMin);
  res.json({
    ...weekStartPayload(weekStartDateStr, tzOffsetMin),
    now: new Date().toISOString(),
    events,
  });
});

app.get('/api/smart-tasks', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM smart_tasks WHERE status = ? ORDER BY priority ASC')
    .all('pending');
  res.json(rows.map(rowToSmartTask));
});

app.post('/api/smart-tasks', (req, res) => {
  const { title = 'New task', description = '', durationMinutes = 30 } = req.body;
  const maxPri = db.prepare('SELECT MAX(priority) AS m FROM smart_tasks').get().m;
  const priority = maxPri != null ? maxPri + 1 : 0;
  const id = randomUUID();
  db.prepare(
    'INSERT INTO smart_tasks (id, title, description, duration_minutes, priority) VALUES (?, ?, ?, ?, ?)'
  ).run(id, title, description, durationMinutes, priority);
  const row = db.prepare('SELECT * FROM smart_tasks WHERE id = ?').get(id);
  res.status(201).json(rowToSmartTask(row));
});

app.patch('/api/smart-tasks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM smart_tasks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const { title, description, durationMinutes } = req.body;
  const updated = { ...row };
  if (title !== undefined) updated.title = title;
  if (description !== undefined) updated.description = description;
  if (durationMinutes !== undefined) updated.duration_minutes = durationMinutes;

  db.prepare(
    'UPDATE smart_tasks SET title = ?, description = ?, duration_minutes = ? WHERE id = ?'
  ).run(updated.title, updated.description, updated.duration_minutes, req.params.id);

  res.json(rowToSmartTask(db.prepare('SELECT * FROM smart_tasks WHERE id = ?').get(req.params.id)));
});

app.delete('/api/smart-tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM smart_tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

app.put('/api/smart-tasks/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds required' });
  }

  const update = db.prepare('UPDATE smart_tasks SET priority = ? WHERE id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  tx();

  const rows = db
    .prepare('SELECT * FROM smart_tasks WHERE status = ? ORDER BY priority ASC')
    .all('pending');
  res.json(rows.map(rowToSmartTask));
});

app.post('/api/smart-tasks/schedule', (req, res) => {
  const tzOffsetMin = tzFromReq(req);
  const weekStartDateStr = resolveWeekStartDateStr(req.body.weekStart, tzOffsetMin);
  const result = scheduleSmartTasks(db, weekStartDateStr, tzOffsetMin);
  const rows = db.prepare('SELECT * FROM calendar_events').all();
  res.json({
    ...result,
    ...weekStartPayload(weekStartDateStr, tzOffsetMin),
    events: expandEventsForWeek(rows, weekStartDateStr, tzOffsetMin),
    smartTasks: db
      .prepare('SELECT * FROM smart_tasks WHERE status = ? ORDER BY priority ASC')
      .all('pending')
      .map(rowToSmartTask),
  });
});

app.post('/api/smart-tasks/recall', (req, res) => {
  const tzOffsetMin = tzFromReq(req);
  const weekStartDateStr = resolveWeekStartDateStr(req.body.weekStart, tzOffsetMin);
  const result = recallSmartTasks(db);
  const rows = db.prepare('SELECT * FROM calendar_events').all();
  res.json({
    ...result,
    ...weekStartPayload(weekStartDateStr, tzOffsetMin),
    events: expandEventsForWeek(rows, weekStartDateStr, tzOffsetMin),
    smartTasks: db
      .prepare('SELECT * FROM smart_tasks WHERE status = ? ORDER BY priority ASC')
      .all('pending')
      .map(rowToSmartTask),
  });
});

app.post('/api/events', (req, res) => {
  const {
    title = 'New event',
    description = '',
    color = '#007AFF',
    startTime,
    endTime,
    durationMinutes = 60,
    recurrenceType = 'none',
    recurrenceDayOfWeek,
    recurrenceDaysMask,
    recurrenceStartMinutes,
  } = req.body;

  const id = randomUUID();

  if (isRecurringType(recurrenceType)) {
    db.prepare(`
      INSERT INTO calendar_events (
        id, title, description, color, recurrence_type,
        recurrence_day_of_week, recurrence_days_mask, recurrence_start_minutes, duration_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      description,
      color,
      recurrenceType,
      recurrenceType === 'weekly' ? recurrenceDayOfWeek : null,
      recurrenceType === 'weekly_days' ? recurrenceDaysMask : recurrenceType === 'weekly' ? (1 << recurrenceDayOfWeek) : null,
      recurrenceStartMinutes,
      durationMinutes
    );
  } else {
    db.prepare(`
      INSERT INTO calendar_events (
        id, title, description, color, start_time, end_time,
        recurrence_type, duration_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, 'none', ?)
    `).run(id, title, description, color, startTime, endTime, durationMinutes);
  }

  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
  res.status(201).json(rowToEvent(row));
});

app.patch('/api/events/:id', (req, res) => {
  const parentId = parseOccurrenceId(req.params.id);
  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(parentId);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const {
    title,
    description,
    color,
    startTime,
    endTime,
    durationMinutes,
    recurrenceDayOfWeek,
    recurrenceStartMinutes,
  } = req.body;

  const updated = { ...row };
  if (title !== undefined) updated.title = title;
  if (description !== undefined) updated.description = description;
  if (color !== undefined) updated.color = color;

  if (isRecurringType(updated.recurrence_type)) {
    if (recurrenceDayOfWeek !== undefined) updated.recurrence_day_of_week = recurrenceDayOfWeek;
    if (recurrenceStartMinutes !== undefined) {
      updated.recurrence_start_minutes = recurrenceStartMinutes;
    }
    if (durationMinutes !== undefined) updated.duration_minutes = durationMinutes;
    db.prepare(`
      UPDATE calendar_events SET
        title = ?, description = ?, color = ?,
        recurrence_day_of_week = ?, recurrence_start_minutes = ?, duration_minutes = ?
      WHERE id = ?
    `).run(
      updated.title,
      updated.description,
      updated.color,
      updated.recurrence_day_of_week,
      updated.recurrence_start_minutes,
      updated.duration_minutes,
      parentId
    );
  } else {
    if (startTime !== undefined) updated.start_time = startTime;
    if (endTime !== undefined) updated.end_time = endTime;
    if (durationMinutes !== undefined) updated.duration_minutes = durationMinutes;
    db.prepare(`
      UPDATE calendar_events SET
        title = ?, description = ?, color = ?,
        start_time = ?, end_time = ?, duration_minutes = ?
      WHERE id = ?
    `).run(
      updated.title,
      updated.description,
      updated.color,
      updated.start_time,
      updated.end_time,
      updated.duration_minutes,
      parentId
    );
  }

  res.json(rowToEvent(db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(parentId)));
});

app.post('/api/events/:id/move', (req, res) => {
  const parentId = parseOccurrenceId(req.params.id);
  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(parentId);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const { weekStart, dayIndex, slotIndex, durationMinutes, tzOffset, startTime: clientStart, endTime: clientEnd } =
    req.body;
  const tzOffsetMin = parseTzOffset(tzOffset);
  const weekStartDateStr = resolveWeekStartDateStr(weekStart, tzOffsetMin);
  const startMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const dur = durationMinutes ?? row.duration_minutes;
  const computedStart = minutesToISO(weekStartDateStr, dayIndex, startMinutes, tzOffsetMin);
  const computedEnd = new Date(new Date(computedStart).getTime() + dur * 60 * 1000).toISOString();
  const startTime = clientStart || computedStart;
  const endTime = clientEnd || computedEnd;

  if (isRecurringType(row.recurrence_type)) {
    if (row.recurrence_type === 'weekly') {
      db.prepare(`
        UPDATE calendar_events SET
          recurrence_day_of_week = ?, recurrence_days_mask = ?, recurrence_start_minutes = ?, duration_minutes = ?
        WHERE id = ?
      `).run(dayIndex, 1 << dayIndex, startMinutes, dur, parentId);
    } else if (row.recurrence_type === 'daily') {
      db.prepare(`
        UPDATE calendar_events SET recurrence_start_minutes = ?, duration_minutes = ? WHERE id = ?
      `).run(startMinutes, dur, parentId);
    } else if (row.recurrence_type === 'weekly_days') {
      const sourceDay = parseOccurrenceDayIndex(req.params.id) ?? dayIndex;
      let mask = row.recurrence_days_mask ?? 0;
      if (dayIndex !== sourceDay) {
        mask = (mask & ~(1 << sourceDay)) | (1 << dayIndex);
      }
      db.prepare(`
        UPDATE calendar_events SET recurrence_days_mask = ?, recurrence_start_minutes = ?, duration_minutes = ?
        WHERE id = ?
      `).run(mask, startMinutes, dur, parentId);
    }
  } else {
    db.prepare(`
      UPDATE calendar_events SET start_time = ?, end_time = ?, duration_minutes = ? WHERE id = ?
    `).run(startTime, endTime, dur, parentId);
  }

  const updated = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(parentId);
  const occurrenceId = isRecurringType(updated.recurrence_type) ? `${parentId}-w${dayIndex}` : parentId;
  res.json({
    event: rowToEvent(updated),
    occurrence: expandEventsForWeek([updated], weekStartDateStr, tzOffsetMin).find((o) => o.id === occurrenceId),
  });
});

app.delete('/api/events/:id', (req, res) => {
  const parentId = parseOccurrenceId(req.params.id);
  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(parentId);
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (row.from_smart_task_id) {
    db.prepare(
      "UPDATE smart_tasks SET status = 'pending', scheduled_event_id = NULL WHERE id = ?"
    ).run(row.from_smart_task_id);
  }

  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(parentId);
  res.status(204).send();
});

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../client/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
