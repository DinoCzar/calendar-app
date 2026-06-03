const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'calendar.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS smart_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    priority INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scheduled_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#007AFF',
    start_time TEXT,
    end_time TEXT,
    recurrence_type TEXT NOT NULL DEFAULT 'none',
    recurrence_day_of_week INTEGER,
    recurrence_start_minutes INTEGER,
    duration_minutes INTEGER NOT NULL,
    from_smart_task_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const smartCount = db.prepare('SELECT COUNT(*) AS c FROM smart_tasks').get().c;
if (smartCount === 0) {
  const insert = db.prepare(
    'INSERT INTO smart_tasks (id, title, description, duration_minutes, priority) VALUES (?, ?, ?, ?, ?)'
  );
  [
    ['st1', 'Pay Bills', 'Monthly utilities', 30, 0],
    ['st2', 'Grocery Shopping', '', 60, 1],
    ['st3', 'Call Accountant', 'Tax prep', 30, 2],
    ['st4', 'Clean Garage', '', 90, 3],
  ].forEach(([id, title, desc, dur, pri]) => insert.run(id, title, desc, dur, pri));
}

const eventCount = db.prepare('SELECT COUNT(*) AS c FROM calendar_events').get().c;
if (eventCount === 0) {
  db.prepare(`
    INSERT INTO calendar_events (
      id, title, description, color, recurrence_type,
      recurrence_day_of_week, recurrence_start_minutes, duration_minutes
    ) VALUES (?, ?, ?, ?, 'weekly', ?, ?, ?)
  `).run('ev1', 'Team Standup', 'Daily sync', '#5856D6', 0, 9 * 60, 30);
}

module.exports = db;
