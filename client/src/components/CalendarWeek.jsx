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
  getDayIndexInWeek,
  isSameDay,
} from '../utils/dates';
import { formatRecurrenceLabel, isRecurringType } from '../utils/recurrence';

const DRAG_THRESHOLD = 8;

function CalendarSlot({ dayIndex, slotIndex, gridColumn, isToday, isPast, isHoverTarget }) {
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
      style={{ gridColumn, gridRow: slotIndex + 2 }}
    />
  );
}

function EventBlock({
  event,
  weekStart,
  gridColumn,
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
    if (e.target.closest('.cal-event__delete, .cal-event__resize')) return;

    e.stopPropagation();

    dragStart.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;

    const onMove = (moveEvent) => {
      if (!dragging.current) {
        const dx = moveEvent.clientX - dragStart.current.x;
        const dy = moveEvent.clientY - dragStart.current.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging.current = true;
        moveEvent.preventDefault();
        if (document.activeElement?.classList.contains('cal-event__title')) {
          document.activeElement.blur();
        }
        onEventDragStart(event, moveEvent.clientX, moveEvent.clientY);
      }
      if (dragging.current) {
        moveEvent.preventDefault();
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
    gridColumn,
    gridRow: `${slotIndex + 2} / span ${slotCount}`,
    opacity: isDraggingThis ? 0.25 : 1,
    backgroundColor: event.color,
  };

  const start = new Date(event.startTime);

  return (
    <div
      className={`cal-event${isDraggingThis ? ' cal-event--dragging' : ''}${isRecurringType(event.recurrenceType) ? ' cal-event--recurring' : ''}`}
      style={style}
      onPointerDown={handleDragPointerDown}
    >
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
            {formatRecurrenceLabel(event.recurrenceType, event.recurrenceDaysMask)}
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

function NowLine({ weekStart, now, viewMode, focusDayIndex, gridColumn }) {
  const todayIndex = Math.round((now - weekStart) / (24 * 60 * 60 * 1000));
  if (todayIndex < 0 || todayIndex > 6) return null;
  if (viewMode === 'day' && focusDayIndex !== todayIndex) return null;

  const minutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
  if (minutes < 0 || minutes >= SLOTS_PER_DAY * SLOT_MINUTES) return null;

  const top = (minutes / 30) * SLOT_HEIGHT;

  return (
    <div className="now-line" style={{ gridColumn, gridRow: '2 / -1', top }}>
      <div className="now-line__dot" />
      <div className="now-line__bar" />
    </div>
  );
}

export default function CalendarWeek({
  weekStart,
  now,
  events,
  viewMode = 'week',
  focusDate,
  isDragging,
  draggingEventId,
  hoverSlot,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
  onCreateEvent,
  onResize,
  onDelete,
  onTitleChange,
  onEventDragStart,
  onEventDragMove,
  onEventDragEnd,
}) {
  const todayStr = now.toDateString();
  const viewingCurrentWeek = weekStart.toDateString() === getWeekStart(now).toDateString();
  const focusDayIndex = Math.max(0, Math.min(6, getDayIndexInWeek(weekStart, focusDate ?? now)));
  const isDayView = viewMode === 'day';
  const dayColumns = isDayView ? [focusDayIndex] : DAY_NAMES.map((_, i) => i);
  const viewingToday = isDayView ? isSameDay(focusDate, now) : viewingCurrentWeek;
  const focusDayDate = getDayDate(weekStart, focusDayIndex);
  const navLabelPrev = isDayView ? 'Previous day' : 'Previous week';
  const navLabelNext = isDayView ? 'Next day' : 'Next week';

  const visibleEvents = isDayView
    ? events.filter((event) => eventToSlot(event, weekStart).dayIndex === focusDayIndex)
    : events;

  const title = isDayView
    ? (viewingToday ? 'Today' : focusDayDate.toLocaleDateString(undefined, { weekday: 'long' }))
    : (viewingCurrentWeek ? 'This Week' : 'Week View');

  const subtitle = isDayView
    ? focusDayDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : `${getDayDate(weekStart, 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${getDayDate(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <section className={`calendar${isDragging ? ' calendar--dragging' : ''}${isDayView ? ' calendar--day' : ''}`}>
      <header className="calendar__header">
        <div className="calendar__nav">
          <button type="button" className="icon-btn" onClick={onPrev} aria-label={navLabelPrev}>‹</button>
          <div className="calendar__title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onNext} aria-label={navLabelNext}>›</button>
        </div>
        <div className="calendar__actions">
          <div className="view-toggle" role="group" aria-label="Calendar view">
            <button
              type="button"
              className={`view-toggle__btn${isDayView ? ' view-toggle__btn--active' : ''}`}
              onClick={() => onViewModeChange('day')}
              aria-pressed={isDayView}
            >
              Day
            </button>
            <button
              type="button"
              className={`view-toggle__btn${!isDayView ? ' view-toggle__btn--active' : ''}`}
              onClick={() => onViewModeChange('week')}
              aria-pressed={!isDayView}
            >
              Week
            </button>
          </div>
          {!viewingToday && (
            <button type="button" className="btn btn--ghost" onClick={onToday}>Today</button>
          )}
          <button type="button" className="btn btn--secondary" onClick={onCreateEvent}>+ Event</button>
        </div>
      </header>

      <div className="calendar__scroll">
        <div
          className={`calendar__grid${isDayView ? ' calendar__grid--day' : ''}`}
          style={{ gridTemplateRows: `auto repeat(${SLOTS_PER_DAY}, ${SLOT_HEIGHT}px)` }}
        >
          <div className="calendar__corner" />
          {dayColumns.map((dayIndex, columnOffset) => {
            const date = getDayDate(weekStart, dayIndex);
            const isToday = date.toDateString() === todayStr;
            const gridColumn = columnOffset + 2;
            return (
              <div
                key={dayIndex}
                className={`cal-day-header${isToday ? ' cal-day-header--today' : ''}`}
                style={{ gridColumn, gridRow: 1 }}
              >
                <span className="cal-day-header__name">{DAY_NAMES[dayIndex]}</span>
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
            dayColumns.map((dayIndex, columnOffset) => {
              const date = getDayDate(weekStart, dayIndex);
              const isToday = date.toDateString() === todayStr;
              const slotDate = new Date(date);
              const slotMinutes = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
              slotDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
              const gridColumn = columnOffset + 2;
              return (
                <CalendarSlot
                  key={`${dayIndex}-${slotIndex}`}
                  dayIndex={dayIndex}
                  slotIndex={slotIndex}
                  gridColumn={gridColumn}
                  isToday={isToday}
                  isPast={slotDate < now}
                  isHoverTarget={
                    hoverSlot?.dayIndex === dayIndex && hoverSlot?.slotIndex === slotIndex
                  }
                />
              );
            })
          )}

          {visibleEvents.map((event) => {
            const { dayIndex } = eventToSlot(event, weekStart);
            const columnOffset = isDayView ? 0 : dayIndex;
            const gridColumn = columnOffset + 2;
            return (
              <EventBlock
                key={event.id}
                event={event}
                weekStart={weekStart}
                gridColumn={gridColumn}
                isDraggingThis={draggingEventId === event.id}
                onResize={onResize}
                onDelete={onDelete}
                onTitleChange={onTitleChange}
                onEventDragStart={onEventDragStart}
                onEventDragMove={onEventDragMove}
                onEventDragEnd={onEventDragEnd}
              />
            );
          })}

          <NowLine
            weekStart={weekStart}
            now={now}
            viewMode={viewMode}
            focusDayIndex={focusDayIndex}
            gridColumn={isDayView ? 2 : Math.round((now - weekStart) / (24 * 60 * 60 * 1000)) + 2}
          />
        </div>
      </div>
    </section>
  );
}
