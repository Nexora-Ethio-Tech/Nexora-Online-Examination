import { CalendarGrid } from './CalendarGrid';
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export function GregorianCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [year = 2026, month = 1, day = 1] = value.slice(0, 10).split('-').map(Number);
  return (
    <CalendarGrid
      value={{ year, month, day }}
      onChange={(v) =>
        onChange(`${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`)
      }
      months={months}
      minYear={1908}
      maxYear={2107}
      daysInMonth={(y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()}
      firstWeekday={(y, m) => new Date(Date.UTC(y, m - 1, 1)).getUTCDay()}
    />
  );
}
