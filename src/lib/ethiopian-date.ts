import { toEC, toGC, type EthiopianDate } from 'kenat';

export const EAT_ZONE = 'Africa/Addis_Ababa';
export const AMHARIC_MONTHS = [
  'መስከረም',
  'ጥቅምት',
  'ኅዳር',
  'ታኅሣሥ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜ',
] as const;
const pad = (value: number) => String(value).padStart(2, '0');

/** Gregorian wall-clock form values remain internal. Never use the host timezone. */
export function toEatInput(iso: string) {
  return new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 16);
}
export function parseEatInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+03:00`);
  if (!Number.isFinite(ms) || toEatInput(new Date(ms).toISOString()) !== value) return null;
  return new Date(ms).toISOString();
}
export function ethiopianFromGregorianDate(value: string): EthiopianDate {
  const [year = NaN, month = NaN, day = NaN] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new Error('Invalid calendar date');
  if (year >= 1900 && year <= 2100) return toEC(year, month, day);
  // Kenat limits its forward conversion to Gregorian 1900–2100.
  const parts = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}
export function gregorianDateFromEthiopian(value: EthiopianDate): string {
  const { year, month, day } = toGC(value.year, value.month, value.day);
  // Kenat 4.0.0's reverse conversion can drift near Gregorian century boundaries.
  // Verify through its independent forward conversion; never submit an unchecked date.
  const candidate = Date.UTC(year, month - 1, day, 12);
  for (const offset of [0, -1, 1, -2, 2]) {
    const date = new Date(candidate + offset * 86400000);
    const back = ethiopianFromGregorianDate(date.toISOString());
    if (back.year === value.year && back.month === value.month && back.day === value.day)
      return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  throw new Error(
    'This date could not be converted safely. Choose another date or contact support.',
  );
}
export function daysInEthiopianMonth(year: number, month: number) {
  return month === 13 ? (year % 4 === 3 ? 6 : 5) : 30;
}
export function formatEatClock(value: string | number, seconds = false) {
  return (
    new Intl.DateTimeFormat('en-US-u-nu-latn', {
      timeZone: EAT_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' as const } : {}),
      hour12: true,
    }).format(new Date(value)) + ' EAT'
  );
}
export function formatEthiopianDate(value: string) {
  const date = ethiopianFromGregorianDate(value);
  return `${date.day} ${AMHARIC_MONTHS[date.month - 1]} ${date.year} ዓ.ም.`;
}
export function formatEatDateTime(value: string, seconds = false) {
  if (!Number.isFinite(Date.parse(value))) return 'Date unavailable';
  return `${formatEthiopianDate(toEatInput(value))} · ${formatEatClock(value, seconds)}`;
}

/** Display only: the input is already a UTC instant; never infer the browser timezone. */
export function formatGregorianEatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
    timeZone: EAT_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
