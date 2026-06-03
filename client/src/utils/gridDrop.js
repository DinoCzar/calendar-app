/**
 * Resolve calendar grid slot from viewport coordinates.
 * Uses elementsFromPoint so drops work even when the drag overlay is on top.
 */
import { SLOTS_PER_DAY, SLOT_MINUTES } from './dates';

export function slotAtPoint(clientX, clientY) {
  if (clientX == null || clientY == null) return null;

  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (el.dataset?.slotIndex != null && el.dataset?.dayIndex != null) {
      const dayIndex = Number(el.dataset.dayIndex);
      const slotIndex = Number(el.dataset.slotIndex);
      if (Number.isFinite(dayIndex) && Number.isFinite(slotIndex)) {
        return { dayIndex, slotIndex };
      }
    }
  }
  return null;
}

export function slotAtRectCenter(rect) {
  if (!rect) return null;
  return slotAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

export function pointerFromDragEvent(event) {
  const activator = event.activatorEvent;
  if (!activator || !('clientX' in activator)) return null;
  return {
    x: activator.clientX + event.delta.x,
    y: activator.clientY + event.delta.y,
  };
}

export function resolveDropSlot(event) {
  const pointer = pointerFromDragEvent(event);
  const fromPointer = pointer ? slotAtPoint(pointer.x, pointer.y) : null;
  if (fromPointer) return fromPointer;

  const translated = event.active?.rect?.current?.translated;
  return slotAtRectCenter(translated);
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
