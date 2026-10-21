import type { EthiopianDate } from 'kenat';
import { AMHARIC_MONTHS, daysInEthiopianMonth } from '@/lib/ethiopian-date';

/** Compact Ethiopian-only adaptation of Kewti's dropdown pattern.
 * Upstream: coderade1905/kewti @ 8bedfc0f6ece86cb9a70324337318a7fb2e2cb40 (MIT).
 * See docs/kewti-calendar-architecture-and-testing.md for provenance and adaptations.
 */
export function KewtiDatePickerDropdown({
  value,
  onChange,
}: {
  value: EthiopianDate;
  onChange: (value: EthiopianDate) => void;
}) {
  function change(part: 'year' | 'month' | 'day', number: number) {
    const next = { ...value, [part]: number };
    next.day = Math.min(next.day, daysInEthiopianMonth(next.year, next.month));
    onChange(next);
  }
  const style =
    'min-h-11 w-full min-w-0 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary';
  return (
    <div className="grid grid-cols-[0.7fr_1.4fr_1fr] gap-2">
      <label className="min-w-0 text-xs">
        Day / ቀን
        <select
          aria-label="Day"
          className={style}
          value={value.day}
          onChange={(e) => change('day', Number(e.target.value))}
        >
          {Array.from(
            { length: daysInEthiopianMonth(value.year, value.month) },
            (_, i) => i + 1,
          ).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-xs">
        Month / ወር
        <select
          aria-label="Month"
          lang="am"
          className={style}
          value={value.month}
          onChange={(e) => change('month', Number(e.target.value))}
        >
          {AMHARIC_MONTHS.map((month, i) => (
            <option key={month} value={i + 1}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-xs">
        Year / ዓ.ም.
        <select
          aria-label="Year"
          className={style}
          value={value.year}
          onChange={(e) => change('year', Number(e.target.value))}
        >
          {Array.from(
            { length: Math.max(2100, value.year) - Math.min(1900, value.year) + 1 },
            (_, i) => Math.min(1900, value.year) + i,
          ).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
