import { useState, useRef } from 'react';
import {
  DAY_NAMES,
  SLOTS_PER_DAY,
  SLOT_HEIGHT,
  SLOT_MINUTES,
  DAY_START_HOUR,
  getDayDate,
  formatSlotTime,
  getWeekStart,
  eventToSlot,
} from '../utils/dates';

const DRAG_THRESHOLD = 8;

function CalendarSlot({ dayIndex, slotIndex, isToday, isPast, isHoverTarget }) {
  return (
    <div
      data-day-index={dayIndex}
      data-slot-index={slotIndex}
      className={[
        'cal-slot',
        isToday && 'cal-slot--today',
        isPast && 'cal-slot--past',
        isHoverTarget && 'cal-slot--over',
      ].filter(Boolean).join(' ')}
      style={{ gridColumn: dayIndex + 2, gridRow: slotIndex + 2 }}
    />
  );
}

function EventBlock({
  event,
  weekStart,
  isDraggingThis,
  onResize,
  onDelete,
  onTitleChange,
  onEventDragStart,
  onEventDragMove,
  onEventDragEnd,
}) {
  const { dayIndex, slotIndex, slotCount } = eventToSlot(event, weekStart);
  const [resizing, setResizing] = useState(false);
  const startY = useRef(0);
  const startDuration = useRef(event.durationMinutes);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  const handleResizeStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    startY.current = e.clientY;
    startDuration.current = event.durationMinutes;

    const onMove = (moveEvent) => {
      const deltaSlots = Math.round((moveEvent.clientY - startY.current) / SLOT_HEIGHT);
      const newDuration = Math.max(30, startDuration.current + deltaSlots * SLOT_MINUTES);
      onResize(event, newDuration, true);
    };

    const onUp = (upEvent) => {
      const deltaSlots = Math.round((upEvent.clientY - startY.current) / SLOT_HEIGHT);
      const newDuration = Math.max(30, startDuration.current + deltaSlots * SLOT_MINUTES);
      onResize(event, newDuration, false);
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleDragPointerDown = (e) => {
    if (resizing || e.button > 0) return;
    e.stopPropagation();
    e.preventDefault();

    dragStart.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;

    const onMove = (moveEvent) => {
      if (!dragging.current) {
        const dx = moveEvent.clientX - dragStart.current.x;
        const dy = moveEvent.clientY - dragStart.current.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging.current = true;
        onEventDragStart(event, moveEvent.clientX, moveEvent.clientY);
      }
      if (dragging.current) {
        onEventDragMove(moveEvent.clientX, moveEvent.clientY);
      }
    };

    const onUp = (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (dragging.current) {
        onEventDragEnd(upEvent.clientX, upEvent.clientY, event);
      }
      dragging.current = false;
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const style = {
    gridColumn: dayIndex + 2,
    gridRow: `${slotIndex + 2} / span ${slotCount}`,
    opacity: isDraggingThis ? 0.25 : 1,
    backgroundColor: event.color,
  };

  const start = new Date(event.startTime);

  return (
    <div
      className={`cal-event${isDraggingThis ? ' cal-event--dragging' : ''}${event.recurrenceType === 'weekly' ? ' cal-event--recurring' : ''}`}
      style={style}
    >
      <button
        type="button"
        className="cal-event__drag-handle"
        aria-label="Drag event"
        onPointerDown={handleDragPointerDown}
      />
      <div className="cal-event__body">
        <div className="cal-event__content">
          <input
            className="cal-event__title"
            value={event.title}
            onChange={(e) => onTitleChange(event, e.target.value)}
            aria-label="Event name"
          />
          <span className="cal-event__time">
            {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {event.recurrenceType === 'weekly' ? ' · Weekly' : ''}
          </span>
        </div>
        <div className="cal-event__resize" onPointerDown={handleResizeStart} />
      </div>
      <button
        type="button"
        className="cal-event__delete"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDelete(event)}
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  );
}

function NowLine({ weekStart, now }) {
  const todayIndex = Math.round((now - weekStart) / (24 * 60 * 60 * 1000));
  if (todayIndex < 0 || todayIndex > 6) return null;

  const minutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
  if (minutes < 0 || minutes >= SLOTS_PER_DAY * SLOT_MINUTES) return null;

  const top = (minutes / 30) * SLOT_HEIGHT;

  return (
    <div className="now-line" style={{ gridColumn: todayIndex + 2, gridRow: '2 / -1', top }}>
      <div className="now-line__dot" />
      <div className="now-line__bar" />
    </div>
  );
}

export default function CalendarWeek({
  weekStart,
  now,
  events,
  isDragging,
  draggingEventId,
  hoverSlot,
  onPrevWeek,
  onNextWeek,
  onToday,
  onCreateEvent,
  onResize,
  onDelete,
  onTitleChange,
  onEventDragStart,
  onEventDragMove,
  onEventDragEnd,
}) {
  const todayStr = now.toDateString();
  const viewingCurrent = weekStart.toDateString() === getWeekStart(now).toDateString();

  return (
    <section className={`calendar${isDragging ? ' calendar--dragging' : ''}`}>
      <header className="calendar__header">
        <div className="calendar__nav">
          <button type="button" className="icon-btn" onClick={onPrevWeek} aria-label="Previous week">‹</button>
          <div className="calendar__title">
            <h1>{viewingCurrent ? 'This Week' : 'Week View'}</h1>
            <p>
              {getDayDate(weekStart, 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {' – '}
              {getDayDate(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onNextWeek} aria-label="Next week">›</button>
        </div>
        <div className="calendar__actions">
          {!viewingCurrent && (
            <button type="button" className="btn btn--ghost" onClick={onToday}>Today</button>
          )}
          <button type="button" className="btn btn--secondary" onClick={onCreateEvent}>+ Event</button>
        </div>
      </header>

      <div className="calendar__scroll">
        <div
          className="calendar__grid"
          style={{ gridTemplateRows: `auto repeat(${SLOTS_PER_DAY}, ${SLOT_HEIGHT}px)` }}
        >
          <div className="calendar__corner" />
          {DAY_NAMES.map((name, i) => {
            const date = getDayDate(weekStart, i);
            const isToday = date.toDateString() === todayStr;
            return (
              <div
                key={name}
                className={`cal-day-header${isToday ? ' cal-day-header--today' : ''}`}
                style={{ gridColumn: i + 2, gridRow: 1 }}
              >
                <span className="cal-day-header__name">{name}</span>
                <span className="cal-day-header__date">{date.getDate()}</span>
              </div>
            );
          })}

          {Array.from({ length: SLOTS_PER_DAY }, (_, slotIndex) => (
            <div key={`t-${slotIndex}`} className="cal-time" style={{ gridColumn: 1, gridRow: slotIndex + 2 }}>
              {formatSlotTime(slotIndex)}
            </div>
          ))}

          {Array.from({ length: SLOTS_PER_DAY }, (_, slotIndex) =>
            DAY_NAMES.map((_, dayIndex) => {
              const date = getDayDate(weekStart, dayIndex);
              const isToday = date.toDateString() === todayStr;
              const slotDate = new Date(date);
              const slotMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
              slotDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
              return (
                <CalendarSlot
                  key={`${dayIndex}-${slotIndex}`}
                  dayIndex={dayIndex}
                  slotIndex={slotIndex}
                  isToday={isToday}
                  isPast={slotDate < now}
                  isHoverTarget={
                    hoverSlot?.dayIndex === dayIndex && hoverSlot?.slotIndex === slotIndex
                  }
                />
              );
            })
          )}

          {events.map((event) => (
            <EventBlock
              key={event.id}
              event={event}
              weekStart={weekStart}
              isDraggingThis={draggingEventId === event.id}
              onResize={onResize}
              onDelete={onDelete}
              onTitleChange={onTitleChange}
              onEventDragStart={onEventDragStart}
              onEventDragMove={onEventDragMove}
              onEventDragEnd={onEventDragEnd}
            />
          ))}

          <NowLine weekStart={weekStart} now={now} />
        </div>
      </div>
    </section>
  );
}
