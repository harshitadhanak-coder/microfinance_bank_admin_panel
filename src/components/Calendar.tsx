import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './icons';
import { BadgeTone } from './Badge';

/**
 * One day cell in a month grid. Tone/label are pre-resolved by the caller so
 * this component stays domain-agnostic (attendance, holidays, anything with a
 * per-day status): `primary` is the main status chip, `extra` are small
 * secondary chips (e.g. "Late"), `title` is the cell tooltip.
 */
export interface CalendarDayCell {
  /** ISO date (`YYYY-MM-DD` or full ISO) — its day-of-month is shown top-left. */
  date: string;
  primary?: { label: string; tone: BadgeTone };
  extra?: { label: string; tone: BadgeTone }[];
  title?: string;
  /** Dim the cell (e.g. future days with no data). */
  dim?: boolean;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A specialized month calendar grid (replaces the raw `.att-cal` table). Days
 * are laid out under Sun–Sat headers with correct leading blanks. Month
 * navigation is controlled — the owner keeps `month`/`year` and reacts to
 * `onPrev`/`onNext` (omit both to hide the nav). `legend` renders under the grid.
 */
export function Calendar({
  month,
  year,
  days,
  onPrev,
  onNext,
  legend,
  aside,
}: {
  month: number;
  year: number;
  days: CalendarDayCell[];
  onPrev?: () => void;
  onNext?: () => void;
  legend?: ReactNode;
  /** Right-aligned content in the calendar header (e.g. a summary chip). */
  aside?: ReactNode;
}) {
  const leadingEmpty = days.length ? new Date(days[0]!.date).getUTCDay() : 0;
  const showNav = !!(onPrev || onNext);

  return (
    <div className="calendar">
      <div className="calendar-head">
        {showNav && (
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous month" disabled={!onPrev}>
            <ChevronLeft size={16} />
          </button>
        )}
        <h3 className="calendar-title">{MONTHS[month - 1]} {year}</h3>
        {showNav && (
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month" disabled={!onNext}>
            <ChevronRight size={16} />
          </button>
        )}
        {aside && <span className="calendar-aside">{aside}</span>}
      </div>

      <div className="calendar-grid">
        {DOW.map((d) => <div key={d} className="calendar-dow">{d}</div>)}
        {Array.from({ length: leadingEmpty }).map((_, i) => <div key={`empty-${i}`} className="calendar-cell empty" aria-hidden="true" />)}
        {days.map((day) => {
          const dom = new Date(day.date).getUTCDate();
          return (
            <div key={day.date} className={`calendar-cell${day.dim ? ' dim' : ''}`} title={day.title}>
              <span className="calendar-dom">{dom}</span>
              {day.primary && <span className={`cal-chip tone-${day.primary.tone}`}>{day.primary.label}</span>}
              {day.extra?.map((e, i) => <span key={i} className={`cal-chip tone-${e.tone}`}>{e.label}</span>)}
            </div>
          );
        })}
      </div>

      {legend && <div className="calendar-legend">{legend}</div>}
    </div>
  );
}
