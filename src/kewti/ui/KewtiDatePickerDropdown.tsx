import type { EthiopianDate } from 'kenat';
import {
  AMHARIC_MONTHS,
  daysInEthiopianMonth,
  gregorianDateFromEthiopian,
} from '@/lib/ethiopian-date';
import { CalendarGrid } from './CalendarGrid';
/** Kewti adaptation; see docs/kewti-calendar-architecture-and-testing.md for provenance. */
export function KewtiDatePickerDropdown({
  value,
  onChange,
}: {
  value: EthiopianDate;
  onChange: (value: EthiopianDate) => void;
}) {
  return (
    <CalendarGrid
      value={value}
      onChange={onChange}
      months={AMHARIC_MONTHS}
      daysInMonth={daysInEthiopianMonth}
      firstWeekday={(year, month) =>
        new Date(gregorianDateFromEthiopian({ year, month, day: 1 }) + 'T12:00:00Z').getUTCDay()
      }
      minYear={1900}
      maxYear={2100}
    />
  );
}
