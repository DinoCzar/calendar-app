import { useEffect, useState } from 'react';
import {
  DAY_NAMES,
  DURATION_OPTIONS,
  TIME_SLOT_OPTIONS,
  combineDateAndMinutes,
  fromDateInputValue,
  getDefaultEventDate,
  getMondayBasedDayIndex,
  toDateInputValue,
} from '../utils/dates';

const DEFAULT_START_MINUTES = 9 * 60;

function formatTimeLabel(minutes) {
  return TIME_SLOT_OPTIONS.find((o) => o.value === minutes)?.label ?? '';
}

export default function EventCreateDialog({ open, weekStart, now, onClose, onCreate }) {
  const [title, setTitle] = useState('New Event');
  const [date, setDate] = useState('');
  const [startMinutes, setStartMinutes] = useState(DEFAULT_START_MINUTES);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defaultDate = getDefaultEventDate(weekStart, now);
    setTitle('New Event');
    setDate(toDateInputValue(defaultDate));
    setStartMinutes(DEFAULT_START_MINUTES);
    setDurationMinutes(60);
    setRecurrenceType('none');
    setSubmitting(false);
  }, [open, weekStart, now]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedDate = date ? fromDateInputValue(date) : null;
  const dayName = selectedDate ? DAY_NAMES[getMondayBasedDayIndex(selectedDate)] : '';
  const timeLabel = formatTimeLabel(startMinutes);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date || submitting) return;

    setSubmitting(true);
    try {
      const eventDate = fromDateInputValue(date);
      const start = combineDateAndMinutes(eventDate, startMinutes);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      if (recurrenceType === 'weekly') {
        await onCreate({
          title: title.trim(),
          recurrenceType: 'weekly',
          recurrenceDayOfWeek: getMondayBasedDayIndex(eventDate),
          recurrenceStartMinutes: startMinutes,
          durationMinutes,
        });
      } else {
        await onCreate({
          title: title.trim(),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          durationMinutes,
        });
      }
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-labelledby="event-create-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="event-create-title">New Event</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="modal__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="field__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Date</span>
            <input
              className="field__input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">Start time</span>
              <select
                className="field__input"
                value={startMinutes}
                onChange={(e) => setStartMinutes(Number(e.target.value))}
              >
                {TIME_SLOT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Duration</span>
              <select
                className="field__input"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="field field--radio">
            <legend className="field__label">Repeat</legend>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence"
                value="none"
                checked={recurrenceType === 'none'}
                onChange={() => setRecurrenceType('none')}
              />
              One-time
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence"
                value="weekly"
                checked={recurrenceType === 'weekly'}
                onChange={() => setRecurrenceType('weekly')}
              />
              Weekly
            </label>
          </fieldset>

          {recurrenceType === 'weekly' && dayName && timeLabel && (
            <p className="modal__hint">
              Repeats every {dayName} at {timeLabel}
            </p>
          )}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting || !title.trim()}>
              {submitting ? 'Adding…' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
