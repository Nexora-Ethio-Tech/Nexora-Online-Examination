import { describe, it, expect } from 'vitest';
import { generateShortUniqueSuffix, extractSchoolPrefix, generateAdminLoginId } from './admin-id';

describe('admin-id generation', () => {
  it('generates a 4-character suffix using valid non-ambiguous characters', () => {
    const suffix = generateShortUniqueSuffix(4);
    expect(suffix).toHaveLength(4);
    expect(suffix).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
  });

  it('generates unique suffixes across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateShortUniqueSuffix(4)));
    expect(set.size).toBe(50);
  });

  describe('extractSchoolPrefix', () => {
    it('extracts prefix from single word school name', () => {
      expect(extractSchoolPrefix('Eagle')).toBe('EAGLE');
      expect(extractSchoolPrefix('Hilltop')).toBe('HILLTO');
    });

    it('filters out generic stopwords like "School", "Academy"', () => {
      expect(extractSchoolPrefix('Eagle School')).toBe('EAGLE');
      expect(extractSchoolPrefix('Bole Secondary School')).toBe('BOLE');
      expect(extractSchoolPrefix('Hawassa Academy')).toBe('HAWASS');
    });

    it('handles short first words like "St."', () => {
      expect(extractSchoolPrefix('St. Joseph School')).toBe('STJOSE');
    });

    it('falls back gracefully when only stopwords are used', () => {
      expect(extractSchoolPrefix('High School')).toBe('HIGH');
      expect(extractSchoolPrefix('')).toBe('SCH');
      expect(extractSchoolPrefix('   ')).toBe('SCH');
    });
  });

  describe('generateAdminLoginId', () => {
    it('formats as ADM-<PREFIX>-<SUFFIX> reflecting the school name', () => {
      const id = generateAdminLoginId('Eagle School', '4K9Z');
      expect(id).toBe('ADM-EAGLE-4K9Z');
      expect(id.length).toBeLessThanOrEqual(16);
    });

    it('is short and avoids conflicts by generating random suffix when omitted', () => {
      const id1 = generateAdminLoginId('Eagle School');
      const id2 = generateAdminLoginId('Eagle School');
      expect(id1).toMatch(/^ADM-EAGLE-[2-9A-HJ-NP-Z]{4}$/);
      expect(id2).toMatch(/^ADM-EAGLE-[2-9A-HJ-NP-Z]{4}$/);
      expect(id1).not.toBe(id2);
    });

    it('handles multi-word and special characters', () => {
      const id = generateAdminLoginId("St. Mary's Catholic School", '8X2P');
      expect(id).toBe('ADM-STMARY-8X2P');
    });
  });
});
