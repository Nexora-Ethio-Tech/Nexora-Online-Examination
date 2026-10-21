import { describe, expect, it } from 'vitest';
import {
  ethiopianFromGregorianDate,
  gregorianDateFromEthiopian,
  formatEatDateTime,
  parseEatInput,
  daysInEthiopianMonth,
} from './ethiopian-date';

describe('Ethiopian calendar in EAT', () => {
  it('uses EAT across midnight with Amharic months, Latin digits and ordinary AM/PM', () => {
    expect(formatEatDateTime('2026-10-15T21:01:00Z')).toBe('6 ጥቅምት 2019 ዓ.ም. · 12:01 AM EAT');
    expect(formatEatDateTime('2026-10-17T06:00:00Z')).toBe('7 ጥቅምት 2019 ዓ.ም. · 9:00 AM EAT');
    expect(formatEatDateTime('2026-10-17T09:00:00Z')).toContain('12:00 PM EAT');
    expect(formatEatDateTime('2026-10-17T12:00:00Z')).toContain('3:00 PM EAT');
    expect(formatEatDateTime('2026-10-17T06:00:00Z')).not.toMatch(/[፩-፼]/);
  });
  it('handles leap Pagume and New Year with known boundary dates', () => {
    expect(ethiopianFromGregorianDate('2023-09-11')).toEqual({ year: 2015, month: 13, day: 6 });
    expect(ethiopianFromGregorianDate('2023-09-12')).toEqual({ year: 2016, month: 1, day: 1 });
    expect(ethiopianFromGregorianDate('2024-09-11')).toEqual({ year: 2017, month: 1, day: 1 });
    expect(daysInEthiopianMonth(2015, 13)).toBe(6);
    expect(daysInEthiopianMonth(2016, 13)).toBe(5);
    expect(() => gregorianDateFromEthiopian({ year: 2016, month: 13, day: 6 })).toThrow();
  });
  it('agrees with the independent Intl Ethiopic calendar and round-trips across a century boundary', () => {
    const oracle = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    for (let year = 1907; year <= 2108; year++)
      for (const month of [1, 2, 9, 12]) {
        const date = `${year}-${String(month).padStart(2, '0')}-11`;
        const parts = oracle.formatToParts(new Date(`${date}T12:00:00Z`));
        const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
        const eth = ethiopianFromGregorianDate(date);
        expect(eth).toEqual({ year: part('year'), month: part('month'), day: part('day') });
        expect(gregorianDateFromEthiopian(eth)).toBe(date);
      }
  });
  it('retains strict Gregorian UTC wire validation instead of treating Ethiopian years as Gregorian', () => {
    expect(parseEatInput('2026-10-17T09:00')).toBe('2026-10-17T06:00:00.000Z');
    expect(parseEatInput('2026-02-30T09:00')).toBeNull();
    expect(parseEatInput('2026-10-17T24:00')).toBeNull();
  });
});
