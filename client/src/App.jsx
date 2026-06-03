import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
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
} from './utils/dates';

export default function App() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [smartTasks, setSmartTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const [error, setError] = useState(null);
  const [previewEvents, setPreviewEvents] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const slotCollision = useCallback((args) => {
    if (!String(args.active.id).startsWith('event-')) {
      return closestCenter(args);
    }

    const isSlot = ({ id }) => String(id).startsWith('slot-');

    const pointerHits = pointerWithin(args).filter(isSlot);
    if (pointerHits.length) return [pointerHits[0]];

    const rectHits = rectIntersection(args).filter(isSlot);
    if (rectHits.length) return [rectHits[0]];

    const centerHits = closestCenter(args).filter(isSlot);
    if (centerHits.length) return [centerHits[0]];

    return [];
  }, []);

  const parseSlotId = (id) => {
    if (!String(id).startsWith('slot-')) return null;
    const [, day, slot] = String(id).split('-');
    return { dayIndex: Number(day), slotIndex: Number(slot) };
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    if (String(e.active.id).startsWith('event-')) {
      setActiveEvent(e.active.data.current?.event ?? null);
    }
  };

  const handleDragEnd = async (e) => {
    const { active, over } = e;
    setIsDragging(false);
    setActiveEvent(null);

    if (!over) return;

    const activeId = String(active.id);

    if (activeId.startsWith('event-')) {
      const slot = parseSlotId(over.id);
      if (!slot) return;
      const event = active.data.current?.event;
      if (!event) return;
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
      }
      return;
    }

    if (active.data.current?.type === 'smart-task') {
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

      <DndContext
        sensors={sensors}
        collisionDetection={slotCollision}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setIsDragging(false);
          setActiveEvent(null);
        }}
      >
        <main className="layout">
          <CalendarWeek
            weekStart={weekStart}
            now={now}
            events={previewEvents ?? events}
            isDragging={isDragging}
            onPrevWeek={() => setWeekStart((w) => addWeeks(w, -1))}
            onNextWeek={() => setWeekStart((w) => addWeeks(w, 1))}
            onToday={() => setWeekStart(getWeekStart(now))}
            onCreateEvent={() => setCreateDialogOpen(true)}
            onResize={handleResize}
            onDelete={handleDeleteEvent}
            onTitleChange={handleTitleChange}
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

        <DragOverlay dropAnimation={null} zIndex={1000}>
          {activeEvent ? (
            <div
              className="cal-event cal-event--overlay"
              style={{
                backgroundColor: activeEvent.color,
                height: `${Math.ceil(activeEvent.durationMinutes / 30) * SLOT_HEIGHT - 2}px`,
              }}
            >
              <span className="cal-event__title">{activeEvent.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
