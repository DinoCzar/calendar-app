import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import CalendarWeek from './components/CalendarWeek';
import SmartTaskSidebar from './components/SmartTaskSidebar';
import EventCreateDialog from './components/EventCreateDialog';
import {
  fetchWeek,
  fetchSmartTasks,
  createSmartTask,
  updateSmartTask,
  deleteSmartTask,
  reorderSmartTasks,
  scheduleSmartTasks,
  createEvent,
  moveEvent,
  updateEvent,
  deleteEvent,
} from './api';
import {
  getWeekStart,
  addWeeks,
  parseParentId,
  EVENT_COLORS,
  SLOT_HEIGHT,
  eventToSlot,
  eventAtSlot,
} from './utils/dates';
import { slotAtPoint, resolveDropSlot } from './utils/gridDrop';

export default function App() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [smartTasks, setSmartTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingEventId, setDraggingEventId] = useState(null);
  const [dragPointer, setDragPointer] = useState(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const [error, setError] = useState(null);
  const [previewEvents, setPreviewEvents] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [hoverSlot, setHoverSlot] = useState(null);

  const loadWeek = useCallback(async (ws) => {
    const data = await fetchWeek(ws);
    setEvents(data.events);
    setNow(new Date(data.now));
  }, []);

  const loadSmartTasks = useCallback(async () => {
    const tasks = await fetchSmartTasks();
    setSmartTasks(tasks);
  }, []);

  const refresh = useCallback(async (ws = weekStart) => {
    await Promise.all([loadWeek(ws), loadSmartTasks()]);
  }, [weekStart, loadWeek, loadSmartTasks]);

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const weekKey = weekStart.toISOString();
  useEffect(() => {
    if (loading) return;
    loadWeek(new Date(weekKey)).catch((e) => setError(e.message));
  }, [weekKey, loading, loadWeek]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 12 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    document.body.classList.toggle('calendar-drag-active', isDragging);
    return () => document.body.classList.remove('calendar-drag-active');
  }, [isDragging]);

  const handleEventDragStart = (event, x, y) => {
    setIsDragging(true);
    setDraggingEventId(event.id);
    setActiveEvent(event);
    setDragPointer({ x, y });
    setHoverSlot(slotAtPoint(x, y));
  };

  const handleEventDragMove = (x, y) => {
    setDragPointer({ x, y });
    setHoverSlot(slotAtPoint(x, y));
  };

  const finishEventDrag = () => {
    setIsDragging(false);
    setDraggingEventId(null);
    setActiveEvent(null);
    setDragPointer(null);
    setHoverSlot(null);
  };

  const handleEventDragEnd = async (x, y, event) => {
    const slot = resolveDropSlot({ x, y }, null, event.durationMinutes);
    finishEventDrag();

    if (!slot) return;

    const { dayIndex, slotIndex } = eventToSlot(event, weekStart);
    if (dayIndex === slot.dayIndex && slotIndex === slot.slotIndex) return;

    const optimistic = eventAtSlot(event, weekStart, slot.dayIndex, slot.slotIndex);
    setEvents((prev) => prev.map((ev) => (ev.id === event.id ? optimistic : ev)));

    try {
      await moveEvent(parseParentId(event.id), {
        weekStart,
        dayIndex: slot.dayIndex,
        slotIndex: slot.slotIndex,
        durationMinutes: event.durationMinutes,
      });
      await loadWeek(weekStart);
    } catch (err) {
      setError(err.message);
      await loadWeek(weekStart);
    }
  };

  const handleDragEnd = async (e) => {
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    if (active.data.current?.type !== 'smart-task') return;

    const overId = String(over.id);
    if (!smartTasks.find((t) => t.id === overId)) return;
    const oldIndex = smartTasks.findIndex((t) => t.id === activeId);
    const newIndex = smartTasks.findIndex((t) => t.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(smartTasks, oldIndex, newIndex);
    setSmartTasks(reordered);
    try {
      const updated = await reorderSmartTasks(reordered.map((t) => t.id));
      setSmartTasks(updated);
    } catch (err) {
      setError(err.message);
      await loadSmartTasks();
    }
  };

  const handleResize = async (event, durationMinutes, preview) => {
    if (preview) {
      setPreviewEvents(
        events.map((ev) =>
          ev.id === event.id ? { ...ev, durationMinutes } : ev
        )
      );
      return;
    }
    setPreviewEvents(null);
    try {
      if (event.recurrenceType === 'weekly') {
        await updateEvent(parseParentId(event.id), { durationMinutes });
      } else {
        const end = new Date(new Date(event.startTime).getTime() + durationMinutes * 60 * 1000);
        await updateEvent(parseParentId(event.id), { durationMinutes, endTime: end.toISOString() });
      }
      await loadWeek(weekStart);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTitleChange = async (event, title) => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === event.id ? { ...ev, title } : ev))
    );
    setPreviewEvents((prev) =>
      prev?.map((ev) => (ev.id === event.id ? { ...ev, title } : ev)) ?? null
    );
    try {
      await updateEvent(parseParentId(event.id), { title });
    } catch (err) {
      setError(err.message);
      await loadWeek(weekStart);
    }
  };

  const handleDeleteEvent = async (event) => {
    try {
      await deleteEvent(parseParentId(event.id));
      await refresh(weekStart);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateEvent = async (data) => {
    try {
      await createEvent({ color: EVENT_COLORS[0], ...data });

      if (data.startTime) {
        const eventWeekStart = getWeekStart(new Date(data.startTime));
        if (eventWeekStart.toDateString() !== weekStart.toDateString()) {
          setWeekStart(eventWeekStart);
          await loadWeek(eventWeekStart);
        } else {
          await loadWeek(weekStart);
        }
      } else {
        await loadWeek(weekStart);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleSchedule = async () => {
    setScheduling(true);
    try {
      const result = await scheduleSmartTasks(weekStart);
      setEvents(result.events);
      setSmartTasks(result.smartTasks);
    } catch (err) {
      setError(err.message);
    } finally {
      setScheduling(false);
    }
  };

  if (loading) {
    return <div className="app app--loading"><p>Loading calendar…</p></div>;
  }

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          {error}
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <main className="layout">
          <CalendarWeek
            weekStart={weekStart}
            now={now}
            events={previewEvents ?? events}
            isDragging={isDragging}
            draggingEventId={draggingEventId}
            hoverSlot={hoverSlot}
            onPrevWeek={() => setWeekStart((w) => addWeeks(w, -1))}
            onNextWeek={() => setWeekStart((w) => addWeeks(w, 1))}
            onToday={() => setWeekStart(getWeekStart(now))}
            onCreateEvent={() => setCreateDialogOpen(true)}
            onResize={handleResize}
            onDelete={handleDeleteEvent}
            onTitleChange={handleTitleChange}
            onEventDragStart={handleEventDragStart}
            onEventDragMove={handleEventDragMove}
            onEventDragEnd={handleEventDragEnd}
          />
          <SmartTaskSidebar
            tasks={smartTasks}
            onAdd={async () => {
              await createSmartTask({ title: 'New Smart Task', durationMinutes: 30 });
              await loadSmartTasks();
            }}
            onUpdate={async (id, data) => {
              await updateSmartTask(id, data);
              await loadSmartTasks();
            }}
            onDelete={async (id) => {
              await deleteSmartTask(id);
              await loadSmartTasks();
            }}
            onSchedule={handleSchedule}
            scheduling={scheduling}
          />
        </main>
      </DndContext>

      {activeEvent && dragPointer && (
        <div
          className="cal-event cal-event--overlay cal-event--floating"
          style={{
            left: dragPointer.x + 12,
            top: dragPointer.y + 12,
            backgroundColor: activeEvent.color,
            height: `${Math.ceil(activeEvent.durationMinutes / 30) * SLOT_HEIGHT - 2}px`,
          }}
        >
          <span className="cal-event__title">{activeEvent.title}</span>
        </div>
      )}

      <EventCreateDialog
        open={createDialogOpen}
        weekStart={weekStart}
        now={now}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateEvent}
      />
    </div>
  );
}
