'use client';

/**
 * Accessible calendar component with keyboard navigation.
 *
 * - Date labels with accessible text.
 * - Selected state (aria-selected).
 * - Unavailable state (aria-disabled).
 * - Current date indicator (aria-current="date").
 * - Month navigation with named buttons.
 * - Arrow key navigation between dates.
 *
 * Requirements: 9.2, 9.3, 9.10, 10.4
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Get the number of days in a month.
 */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the day of the week (0=Sun) for the first day of the month.
 */
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

/**
 * Format a date as YYYY-MM-DD for comparison.
 */
function toDateString(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @param {object} props
 * @param {Date} [props.initialDate] - Initial month to display (defaults to today)
 * @param {string} [props.selectedDate] - Selected date as YYYY-MM-DD
 * @param {function} [props.onSelect] - Called with YYYY-MM-DD when a date is selected
 * @param {function} [props.isUnavailable] - Returns true if a date (YYYY-MM-DD) is unavailable
 * @param {string} [props['aria-label']='Calendar'] - Calendar region label
 * @param {string} [props.className]
 */
export function Calendar({
  initialDate,
  selectedDate,
  onSelect,
  isUnavailable,
  'aria-label': ariaLabel = 'Calendar',
  className = '',
  ...rest
}) {
  const today = new Date();
  const todayString = toDateString(today.getFullYear(), today.getMonth(), today.getDate());

  const initial = initialDate || today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [focusedDay, setFocusedDay] = useState(initial.getDate());

  const gridRef = useRef(null);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = getFirstDayOfMonth(viewYear, viewMonth);

  // Ensure focusedDay is within valid range when month changes
  useEffect(() => {
    const maxDay = getDaysInMonth(viewYear, viewMonth);
    if (focusedDay > maxDay) {
      setFocusedDay(maxDay);
    }
  }, [viewYear, viewMonth, focusedDay]);

  const goToPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const handleDayClick = useCallback(
    (day) => {
      const dateStr = toDateString(viewYear, viewMonth, day);
      if (isUnavailable && isUnavailable(dateStr)) return;
      setFocusedDay(day);
      if (onSelect) onSelect(dateStr);
    },
    [viewYear, viewMonth, isUnavailable, onSelect]
  );

  const handleKeyDown = useCallback(
    (e) => {
      let newDay = focusedDay;
      let newMonth = viewMonth;
      let newYear = viewYear;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          newDay = focusedDay + 1;
          if (newDay > daysInMonth) {
            newDay = 1;
            newMonth = viewMonth + 1;
            if (newMonth > 11) { newMonth = 0; newYear = viewYear + 1; }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newDay = focusedDay - 1;
          if (newDay < 1) {
            newMonth = viewMonth - 1;
            if (newMonth < 0) { newMonth = 11; newYear = viewYear - 1; }
            newDay = getDaysInMonth(newYear, newMonth);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          newDay = focusedDay + 7;
          if (newDay > daysInMonth) {
            newDay = newDay - daysInMonth;
            newMonth = viewMonth + 1;
            if (newMonth > 11) { newMonth = 0; newYear = viewYear + 1; }
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          newDay = focusedDay - 7;
          if (newDay < 1) {
            newMonth = viewMonth - 1;
            if (newMonth < 0) { newMonth = 11; newYear = viewYear - 1; }
            newDay = getDaysInMonth(newYear, newMonth) + newDay;
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          handleDayClick(focusedDay);
          return;
        default:
          return;
      }

      if (newMonth !== viewMonth || newYear !== viewYear) {
        setViewYear(newYear);
        setViewMonth(newMonth);
      }
      setFocusedDay(newDay);
    },
    [focusedDay, viewMonth, viewYear, daysInMonth, handleDayClick]
  );

  // Focus the active cell when focusedDay changes
  useEffect(() => {
    if (!gridRef.current) return;
    const btn = gridRef.current.querySelector('[tabindex="0"]');
    if (btn && gridRef.current.contains(document.activeElement)) {
      btn.focus();
    }
  }, [focusedDay, viewMonth, viewYear]);

  // Build day cells
  const cells = [];
  // Empty cells before first day
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(<td key={`empty-${i}`} />);
  }
  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateString(viewYear, viewMonth, day);
    const isToday = dateStr === todayString;
    const isSelected = dateStr === selectedDate;
    const unavailable = isUnavailable ? isUnavailable(dateStr) : false;
    const isFocused = day === focusedDay;

    cells.push(
      <td key={day} role="gridcell" aria-selected={isSelected || undefined}>
        <button
          type="button"
          tabIndex={isFocused ? 0 : -1}
          aria-label={`${MONTH_NAMES[viewMonth]} ${day}, ${viewYear}`}
          aria-pressed={isSelected || undefined}
          aria-disabled={unavailable || undefined}
          aria-current={isToday ? 'date' : undefined}
          disabled={unavailable}
          onClick={() => handleDayClick(day)}
          className={[
            'w-10 h-10 rounded-full',
            'text-[var(--text-sm)]',
            'flex items-center justify-center',
            'cursor-pointer',
            'transition-colors duration-[var(--transition-normal)]',
            'focus-visible:outline-none',
            'focus-visible:ring-[length:var(--focus-ring-width)]',
            'focus-visible:ring-[var(--focus-ring-color)]',
            'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
            isSelected
              ? 'bg-[var(--action-primary)] text-[var(--text-on-primary)]'
              : isToday
                ? 'font-[var(--weight-bold)] border border-[var(--action-primary)] text-[var(--action-primary)]'
                : 'text-[var(--text-primary)] hover:bg-[var(--action-ghost-hover)]',
            unavailable
              ? 'opacity-40 cursor-not-allowed'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {day}
        </button>
      </td>
    );
  }

  // Arrange into rows of 7
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(
      <tr key={i}>
        {cells.slice(i, i + 7)}
      </tr>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`inline-block ${className}`}
      role="group"
      {...rest}
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-[var(--space-sm)]">
        <button
          type="button"
          aria-label={`Previous month, ${MONTH_NAMES[viewMonth === 0 ? 11 : viewMonth - 1]} ${viewMonth === 0 ? viewYear - 1 : viewYear}`}
          onClick={goToPrevMonth}
          className={[
            'min-h-[var(--control-min-size)] min-w-[var(--control-min-size)]',
            'flex items-center justify-center rounded-lg',
            'text-[var(--text-primary)]',
            'hover:bg-[var(--action-ghost-hover)]',
            'focus-visible:outline-none',
            'focus-visible:ring-[length:var(--focus-ring-width)]',
            'focus-visible:ring-[var(--focus-ring-color)]',
            'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
          ].join(' ')}
        >
          ‹
        </button>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="text-[var(--text-base)] font-[var(--weight-semibold)] text-[var(--text-primary)]"
        >
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          aria-label={`Next month, ${MONTH_NAMES[viewMonth === 11 ? 0 : viewMonth + 1]} ${viewMonth === 11 ? viewYear + 1 : viewYear}`}
          onClick={goToNextMonth}
          className={[
            'min-h-[var(--control-min-size)] min-w-[var(--control-min-size)]',
            'flex items-center justify-center rounded-lg',
            'text-[var(--text-primary)]',
            'hover:bg-[var(--action-ghost-hover)]',
            'focus-visible:outline-none',
            'focus-visible:ring-[length:var(--focus-ring-width)]',
            'focus-visible:ring-[var(--focus-ring-color)]',
            'focus-visible:ring-offset-[length:var(--focus-ring-offset)]',
          ].join(' ')}
        >
          ›
        </button>
      </div>

      {/* Date grid */}
      <table
        role="grid"
        aria-label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}
        ref={gridRef}
        onKeyDown={handleKeyDown}
      >
        <thead>
          <tr>
            {DAYS_OF_WEEK.map((day) => (
              <th
                key={day}
                scope="col"
                abbr={day}
                className="text-[var(--text-xs)] font-[var(--weight-medium)] text-[var(--text-secondary)] text-center p-[var(--space-xs)]"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export default Calendar;
