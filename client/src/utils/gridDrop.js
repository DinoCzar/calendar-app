import { SLOTS_PER_DAY, SLOT_MINUTES } from './dates';

const SNAP_DISTANCE_PX = 60;

function readSlot(el) {
  const dayIndex = Number(el.dataset.dayIndex);
  const slotIndex = Number(el.dataset.slotIndex);
  if (!Number.isFinite(dayIndex) || !Number.isFinite(slotIndex)) return null;
  return { dayIndex, slotIndex };
}

/**
 * Find the slot under a viewport point by measuring slot rectangles directly.
 * Works when a drag overlay sits above the grid (unlike elementsFromPoint).
 */
export function slotAtPoint(clientX, clientY) {
  if (clientX == null || clientY == null) return null;

  const slots = document.querySelectorAll('[data-day-index][data-slot-index]');
  let closest = null;
  let closestDist = Infinity;

  for (const el of slots) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (inside) return readSlot(el);

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = el;
    }
  }

  if (closest && closestDist <= SNAP_DISTANCE_PX) return readSlot(closest);
  return null;
}

export function slotAtRectCenter(rect) {
  if (!rect) return null;
  return slotAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

export function clampDropSlot(slot, durationMinutes) {
  if (!slot) return null;
  const slotCount = Math.max(1, Math.ceil(durationMinutes / SLOT_MINUTES));
  const maxSlot = SLOTS_PER_DAY - slotCount;
  return {
    dayIndex: Math.max(0, Math.min(6, slot.dayIndex)),
    slotIndex: Math.max(0, Math.min(maxSlot, slot.slotIndex)),
  };
}

export function resolveDropSlot(pointer, translatedRect, durationMinutes) {
  const fromPointer = pointer ? slotAtPoint(pointer.x, pointer.y) : null;
  const raw = fromPointer ?? slotAtRectCenter(translatedRect);
  return clampDropSlot(raw, durationMinutes);
}
