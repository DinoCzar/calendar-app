import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DURATION_OPTIONS } from '../utils/dates';

function SmartTaskItem({ task, index, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'smart-task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="smart-task">
      <button type="button" className="smart-task__handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="11" cy="4" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
        </svg>
      </button>
      <div className="smart-task__body">
        <span className="smart-task__rank">{index + 1}</span>
        <input
          className="smart-task__title"
          value={task.title}
          onChange={(e) => onUpdate(task.id, { title: e.target.value })}
        />
        {task.description && (
          <p className="smart-task__desc">{task.description}</p>
        )}
        <select
          className="smart-task__duration"
          value={task.durationMinutes}
          onChange={(e) => onUpdate(task.id, { durationMinutes: Number(e.target.value) })}
        >
          {DURATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <button type="button" className="smart-task__delete" onClick={() => onDelete(task.id)} aria-label="Delete">×</button>
    </li>
  );
}

export default function SmartTaskSidebar({
  tasks,
  onAdd,
  onUpdate,
  onDelete,
  onSchedule,
  onRecall,
  scheduling,
  recalling,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h2>Smart Tasks</h2>
        <p className="sidebar__hint">Drag to reorder · Top = highest priority</p>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="smart-task-list">
          {tasks.map((task, i) => (
            <SmartTaskItem
              key={task.id}
              task={task}
              index={i}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>

      {tasks.length === 0 && (
        <p className="sidebar__empty">All smart tasks are scheduled.</p>
      )}

      <div className="sidebar__actions">
        <button type="button" className="btn btn--secondary" onClick={onAdd}>
          + New Smart Task
        </button>
        <div className="sidebar__actions-row">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onRecall}
            disabled={recalling || scheduling}
          >
            {recalling ? 'Recalling…' : 'Recall Tasks'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSchedule}
            disabled={scheduling || recalling || tasks.length === 0}
          >
            {scheduling ? 'Scheduling…' : 'Add Smart Tasks'}
          </button>
        </div>
      </div>
    </aside>
  );
}
