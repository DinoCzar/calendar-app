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
import {
  dayIndexToMask,
  formatDaysMask,
  maskIncludesDay,
  toggleMaskDay,
} from '../utils/recurrence';

const DEFAULT_START_MINUTES = 9 * 60;

function formatTimeLabel(minutes) {
  return TIME_SLOT_OPTIONS.find((o) => o.value === minutes)?.label ?? '';
}

export default function EventCreateDialog({ open, weekStart, now, defaultFocusDate, onClose, onCreate }) {
  const [title, setTitle] = useState('New Event');
  const [date, setDate] = useState('');
  const [startMinutes, setStartMinutes] = useState(DEFAULT_START_MINUTES);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [weeklyDaysMask, setWeeklyDaysMask] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defaultDate = defaultFocusDate
      ? new Date(defaultFocusDate)
      : getDefaultEventDate(weekStart, now);
    setTitle('New Event');
    setDate(toDateInputValue(defaultDate));
    setStartMinutes(DEFAULT_START_MINUTES);
    setDurationMinutes(60);
    setRecurrenceType('none');
    setWeeklyDaysMask(dayIndexToMask(getMondayBasedDayIndex(defaultDate)));
    setSubmitting(false);
  }, [open, weekStart, now, defaultFocusDate]);

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

  const handleRecurrenceChange = (type) => {
    setRecurrenceType(type);
    if (type === 'weekly_days' && selectedDate && weeklyDaysMask === 0) {
      setWeeklyDaysMask(dayIndexToMask(getMondayBasedDayIndex(selectedDate)));
    }
    if (type === 'weekly' && selectedDate) {
      setWeeklyDaysMask(dayIndexToMask(getMondayBasedDayIndex(selectedDate)));
    }
  };

  const handleDateChange = (value) => {
    setDate(value);
    if (!value) return;
    const eventDate = fromDateInputValue(value);
    const dayIndex = getMondayBasedDayIndex(eventDate);
    if (recurrenceType === 'weekly') {
      setWeeklyDaysMask(dayIndexToMask(dayIndex));
    } else if (recurrenceType === 'weekly_days' && !maskIncludesDay(weeklyDaysMask, dayIndex)) {
      setWeeklyDaysMask((mask) => mask | dayIndexToMask(dayIndex));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date || submitting) return;
    if (recurrenceType === 'weekly_days' && weeklyDaysMask === 0) return;

    setSubmitting(true);
    try {
      const eventDate = fromDateInputValue(date);
      const start = combineDateAndMinutes(eventDate, startMinutes);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      if (recurrenceType === 'daily') {
        await onCreate({
          title: title.trim(),
          recurrenceType: 'daily',
          recurrenceStartMinutes: startMinutes,
          durationMinutes,
        });
      } else if (recurrenceType === 'weekly') {
        await onCreate({
          title: title.trim(),
          recurrenceType: 'weekly',
          recurrenceDayOfWeek: getMondayBasedDayIndex(eventDate),
          recurrenceStartMinutes: startMinutes,
          durationMinutes,
        });
      } else if (recurrenceType === 'weekly_days') {
        await onCreate({
          title: title.trim(),
          recurrenceType: 'weekly_days',
          recurrenceDaysMask: weeklyDaysMask,
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

  const recurrenceHint = (() => {
    if (!timeLabel) return null;
    if (recurrenceType === 'daily') return `Repeats every day at ${timeLabel}`;
    if (recurrenceType === 'weekly' && dayName) return `Repeats every ${dayName} at ${timeLabel}`;
    if (recurrenceType === 'weekly_days') {
      const days = formatDaysMask(weeklyDaysMask);
      return days ? `Repeats every ${days} at ${timeLabel}` : 'Select at least one day';
    }
    return null;
  })();

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
              onChange={(e) => handleDateChange(e.target.value)}
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
                onChange={() => handleRecurrenceChange('none')}
              />
              One-time
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence"
                value="daily"
                checked={recurrenceType === 'daily'}
                onChange={() => handleRecurrenceChange('daily')}
              />
              Daily
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence"
                value="weekly"
                checked={recurrenceType === 'weekly'}
                onChange={() => handleRecurrenceChange('weekly')}
              />
              Weekly
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence"
                value="weekly_days"
                checked={recurrenceType === 'weekly_days'}
                onChange={() => handleRecurrenceChange('weekly_days')}
              />
              Custom days each week
            </label>
          </fieldset>

          {recurrenceType === 'weekly_days' && (
            <div className="day-picker" role="group" aria-label="Repeat on days">
              {DAY_NAMES.map((name, dayIndex) => (
                <button
                  key={name}
                  type="button"
                  className={`day-picker__btn${maskIncludesDay(weeklyDaysMask, dayIndex) ? ' day-picker__btn--active' : ''}`}
                  aria-pressed={maskIncludesDay(weeklyDaysMask, dayIndex)}
                  onClick={() => setWeeklyDaysMask((mask) => toggleMaskDay(mask, dayIndex))}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {recurrenceHint && (
            <p className="modal__hint">{recurrenceHint}</p>
          )}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting || !title.trim() || (recurrenceType === 'weekly_days' && weeklyDaysMask === 0)}
            >
              {submitting ? 'Adding…' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
