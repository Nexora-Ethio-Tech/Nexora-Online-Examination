import { useState } from 'react';
import type { EthiopianDate } from 'kenat';
import { Button } from '@/components/ui/button';

export function CalendarGrid({
  value,
  onChange,
  months,
  daysInMonth,
  firstWeekday,
  minYear,
  maxYear,
}: {
  value: EthiopianDate;
  onChange: (v: EthiopianDate) => void;
  months: readonly string[];
  daysInMonth: (year: number, month: number) => number;
  firstWeekday: (year: number, month: number) => number;
  minYear: number;
  maxYear: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = 'min-h-11 min-w-0 w-full rounded border bg-background p-2';
  function change(year: number, month: number) {
    if (year < minYear || year > maxYear) return;
    onChange({ year, month, day: Math.min(value.day, daysInMonth(year, month)) });
  }
  const offset = (firstWeekday(value.year, value.month) + 6) % 7;
  return (
    <div className="min-w-0 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="min-w-0 text-xs">
          Month
          <select
            aria-label="Month"
            className={style}
            value={value.month}
            onChange={(e) => change(value.year, Number(e.target.value))}
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs">
          Day
          <select
            aria-label="Day"
            className={style}
            value={value.day}
            onChange={(e) => onChange({ ...value, day: Number(e.target.value) })}
          >
            {Array.from({ length: daysInMonth(value.year, value.month) }, (_, i) => i + 1).map(
              (day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="min-w-0 text-xs">
          Year
          <input
            aria-label="Year"
            className={style}
            type="number"
            min={minYear}
            max={maxYear}
            key={value.year}
            defaultValue={value.year}
            onBlur={(e) => {
              const year = Number(e.target.value);
              if (Number.isInteger(year) && year >= minYear && year <= maxYear)
                change(year, value.month);
              else e.target.value = String(value.year);
            }}
          />
        </label>
      </div>
      <Button
        type="button"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="w-full"
      >
        {value.day} {months[value.month - 1]} {value.year} ·{' '}
        {expanded ? 'Close calendar' : 'Choose date'}
      </Button>
      {expanded && (
        <div
          className="max-h-[60dvh] space-y-3 overflow-y-auto rounded border p-2"
          aria-label="Calendar"
        >
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              aria-label="Previous month"
              disabled={value.year === minYear && value.month === 1}
              onClick={() =>
                change(
                  value.month === 1 ? value.year - 1 : value.year,
                  value.month === 1 ? months.length : value.month - 1,
                )
              }
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label="Next month"
              disabled={value.year === maxYear && value.month === months.length}
              onClick={() =>
                change(
                  value.month === months.length ? value.year + 1 : value.year,
                  value.month === months.length ? 1 : value.month + 1,
                )
              }
            >
              Next
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth(value.year, value.month) }, (_, i) => i + 1).map(
              (day) => (
                <button
                  type="button"
                  key={day}
                  aria-label={`Day ${day}`}
                  aria-pressed={day === value.day}
                  className={`min-h-11 rounded border ${day === value.day ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                  onClick={() => onChange({ ...value, day })}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
