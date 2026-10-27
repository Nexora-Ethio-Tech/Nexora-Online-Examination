import { useId, useState } from 'react';
import { GregorianCalendar } from '@/kewti/ui/GregorianCalendar';
import { KewtiDatePickerDropdown } from '@/kewti/ui/KewtiDatePickerDropdown';
import { Button } from '@/components/ui/button';
import {
  ethiopianFromGregorianDate,
  gregorianDateFromEthiopian,
  toEatInput,
  formatEthiopianDate,
  formatEatDateTime,
  formatGregorianEatDate,
  parseEatInput,
} from '@/lib/ethiopian-date';

/** UI uses Ethiopian dates; callers retain Gregorian EAT wall-time values and existing UTC APIs. */
export function EthiopianDateTimeField({
  label,
  value,
  onChange,
  disabled,
  error,
  dateOnly = false,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  dateOnly?: boolean;
  optional?: boolean;
}) {
  const id = useId();
  const [calendar, setCalendar] = useState<'ethiopian' | 'gregorian'>('ethiopian');
  const fallback = toEatInput(new Date().toISOString());
  const current = value || (dateOnly ? fallback.slice(0, 10) : fallback);
  const date = ethiopianFromGregorianDate(current);
  const [hour24 = 0, minute = 0] = (current.split('T')[1] ?? '00:00').split(':').map(Number);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  function time(hour: number, min: number, half: string) {
    const h = (hour % 12) + (half === 'PM' ? 12 : 0);
    onChange(
      `${current.slice(0, 10)}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    );
  }
  const selectStyle =
    'min-h-11 w-full rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary';
  const iso = dateOnly ? null : parseEatInput(current);
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
      aria-invalid={!!error}
      className="min-w-0 space-y-3 self-start rounded border bg-background p-4"
    >
      <legend className="px-1 text-sm font-medium">
        {label}
        {!optional && (
          <span aria-hidden="true" className="text-destructive">
            {' '}
            *
          </span>
        )}
      </legend>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {calendar === 'ethiopian' ? 'Ethiopian' : 'Gregorian'} calendar ·{' '}
        {dateOnly ? 'EAT' : 'East Africa Time (EAT) · AM/PM'}
      </p>
      {!value && optional ? (
        <Button type="button" variant="outline" onClick={() => onChange(current)}>
          Choose date
        </Button>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-1 rounded border bg-muted p-1"
            aria-label="Calendar system"
          >
            <Button
              type="button"
              className="flex-1 aria-pressed:bg-background aria-pressed:shadow-sm"
              variant="ghost"
              aria-pressed={calendar === 'ethiopian'}
              onClick={() => setCalendar('ethiopian')}
            >
              Ethiopian
            </Button>
            <Button
              type="button"
              className="flex-1 aria-pressed:bg-background aria-pressed:shadow-sm"
              variant="ghost"
              aria-pressed={calendar === 'gregorian'}
              onClick={() => setCalendar('gregorian')}
            >
              Gregorian
            </Button>
          </div>
          {calendar === 'gregorian' ? (
            <GregorianCalendar
              value={current}
              onChange={(next) => onChange(`${next}${dateOnly ? '' : `T${current.slice(11)}`}`)}
            />
          ) : (
            <KewtiDatePickerDropdown
              value={date}
              onChange={(next) =>
                onChange(
                  `${gregorianDateFromEthiopian(next)}${dateOnly ? '' : `T${current.slice(11)}`}`,
                )
              }
            />
          )}
          {!dateOnly && (
            <div className="grid grid-cols-3 gap-2 border-t pt-3">
              <label className="text-xs">
                Hour
                <select
                  aria-label="Hour"
                  className={selectStyle}
                  value={hour12}
                  onChange={(e) => time(Number(e.target.value), minute, period)}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Minute
                <select
                  aria-label="Minute"
                  className={selectStyle}
                  value={minute}
                  onChange={(e) => time(hour12, Number(e.target.value), period)}
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                AM / PM
                <select
                  aria-label="AM / PM"
                  className={selectStyle}
                  value={period}
                  onChange={(e) => time(hour12, minute, e.target.value)}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </label>
            </div>
          )}
          <div className="space-y-1 rounded border bg-muted p-3 text-sm" aria-live="polite">
            <p className="font-medium">
              {dateOnly
                ? `${formatEthiopianDate(current)} (EAT)`
                : iso
                  ? formatEatDateTime(iso)
                  : 'Choose a valid date and time.'}
            </p>
            <p className="text-xs text-muted-foreground">
              Gregorian equivalent:{' '}
              {formatGregorianEatDate(
                dateOnly
                  ? current.slice(0, 10) + 'T12:00:00+03:00'
                  : (iso ?? current + ':00+03:00'),
              )}
              {!dateOnly && ' · EAT'}
            </p>
          </div>
          {optional && (
            <Button type="button" variant="ghost" onClick={() => onChange('')}>
              Clear date
            </Button>
          )}
        </>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
