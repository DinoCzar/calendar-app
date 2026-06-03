export const SLOT_MINUTES = 30;
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 21;
export const SLOTS_PER_DAY = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;
export const SLOT_HEIGHT = 28;

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addWeeks(weekStart, count) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + count * 7);
  return d;
}

export function isSameWeek(a, b) {
  return getWeekStart(a).toDateString() === getWeekStart(b).toDateString();
}

export function getDayDate(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

export function formatSlotTime(slotIndex) {
  const totalMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function eventToSlot(event, weekStart) {
  const start = new Date(event.startTime);
  const ws = getWeekStart(weekStart);
  const dayIndex = Math.floor((start.getTime() - ws.getTime()) / (24 * 60 * 60 * 1000));
  const totalMinutes = start.getHours() * 60 + start.getMinutes() - DAY_START_HOUR * 60;
  const slotIndex = Math.max(0, Math.floor(totalMinutes / SLOT_MINUTES));
  const slotCount = Math.max(1, Math.ceil(event.durationMinutes / SLOT_MINUTES));
  return {
    dayIndex: Math.max(0, Math.min(6, dayIndex)),
    slotIndex: Math.max(0, Math.min(SLOTS_PER_DAY - 1, slotIndex)),
    slotCount,
  };
}

export function parseParentId(id) {
  const str = String(id);
  const match = str.match(/^(.+)-w\d+$/);
  return match ? match[1] : str.replace(/^occ-/, '');
}

export const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
  { label: '90 min', value: 90 },
  { label: '120 min', value: 120 },
];

export const EVENT_COLORS = ['#007AFF', '#5856D6', '#FF9500', '#FF3B30', '#34C759', '#AF52DE'];

export function toDateInputValue(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateInputValue(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getMondayBasedDayIndex(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function combineDateAndMinutes(date, minutesFromMidnight) {
  const d = new Date(date);
  d.setHours(Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, 0);
  return d;
}

export function getDefaultEventDate(weekStart, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const ws = getWeekStart(weekStart);
  const we = addWeeks(ws, 1);
  if (today >= ws && today < we) return today;
  return new Date(ws);
}

export const TIME_SLOT_OPTIONS = Array.from(
  { length: ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES },
  (_, i) => {
    const minutes = DAY_START_HOUR * 60 + i * SLOT_MINUTES;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return {
      value: minutes,
      label: `${hour12}:${m.toString().padStart(2, '0')} ${period}`,
    };
  }
);
