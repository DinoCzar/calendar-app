const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateOnly(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOnly(str) {
  if (!str) return null;
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { year: y, month: m - 1, day: d };
}

function localWallToUtcMs(year, month, day, hours, minutes, tzOffsetMin) {
  return Date.UTC(year, month, day, hours, minutes, 0, 0) + tzOffsetMin * 60 * 1000;
}

function utcMsToLocalParts(ms, tzOffsetMin) {
  const adjusted = ms - tzOffsetMin * 60 * 1000;
  const d = new Date(adjusted);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

function localDayOfWeek(year, month, day) {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

function getWeekStartDateStr(fromInstant, tzOffsetMin) {
  const parts = utcMsToLocalParts(new Date(fromInstant).getTime(), tzOffsetMin);
  const dow = localDayOfWeek(parts.year, parts.month, parts.day);
  const diff = dow === 0 ? -6 : 1 - dow;
  const mondayMs = localWallToUtcMs(parts.year, parts.month, parts.day, 0, 0, tzOffsetMin) + diff * DAY_MS;
  const mon = utcMsToLocalParts(mondayMs, tzOffsetMin);
  return formatDateOnly(mon.year, mon.month, mon.day);
}

function resolveWeekStartDateStr(weekStartParam, tzOffsetMin) {
  if (!weekStartParam) return getWeekStartDateStr(new Date(), tzOffsetMin);
  if (/^\d{4}-\d{2}-\d{2}/.test(String(weekStartParam))) {
    return String(weekStartParam).slice(0, 10);
  }
  return getWeekStartDateStr(new Date(weekStartParam), tzOffsetMin);
}

function weekStartMs(weekStartDateStr, tzOffsetMin) {
  const parts = parseDateOnly(weekStartDateStr);
  if (!parts) return null;
  return localWallToUtcMs(parts.year, parts.month, parts.day, 0, 0, tzOffsetMin);
}

function minutesToISO(weekStartDateStr, dayIndex, minutesFromMidnight, tzOffsetMin) {
  const ws = weekStartMs(weekStartDateStr, tzOffsetMin);
  if (ws == null) return null;
  return new Date(ws + dayIndex * DAY_MS + minutesFromMidnight * 60 * 1000).toISOString();
}

function isoToLocalMinutes(iso, tzOffsetMin) {
  const parts = utcMsToLocalParts(new Date(iso).getTime(), tzOffsetMin);
  return parts.hours * 60 + parts.minutes;
}

function isoToDayIndex(iso, weekStartDateStr, tzOffsetMin) {
  const ws = weekStartMs(weekStartDateStr, tzOffsetMin);
  if (ws == null) return 0;
  return Math.floor((new Date(iso).getTime() - ws) / DAY_MS);
}

function parseTzOffset(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

module.exports = {
  DAY_MS,
  formatDateOnly,
  parseDateOnly,
  getWeekStartDateStr,
  resolveWeekStartDateStr,
  weekStartMs,
  minutesToISO,
  isoToLocalMinutes,
  isoToDayIndex,
  parseTzOffset,
};
