import { randomBytes } from 'crypto';

const SUFFIX_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const NOISE_WORDS = new Set([
  'school',
  'schools',
  'academy',
  'academies',
  'college',
  'colleges',
  'university',
  'universities',
  'institute',
  'institution',
  'elementary',
  'secondary',
  'primary',
  'high',
  'the',
  'of',
  'and',
  '&',
]);

/**
 * Generate a short, conflict-free random alphanumeric suffix.
 * Uses base32 character set avoiding ambiguous 0, O, 1, I characters.
 */
export function generateShortUniqueSuffix(length = 4): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += SUFFIX_CHARS[bytes[i] % SUFFIX_CHARS.length];
  }
  return result;
}

/**
 * Extract a concise, uppercase school prefix reflecting the school name.
 */
export function extractSchoolPrefix(schoolName: string): string {
  const clean = schoolName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim();
  const words = clean.split(/[\s-]+/).filter((w) => w.length > 0);
  const significant = words.filter((w) => !NOISE_WORDS.has(w.toLowerCase()));

  let token = '';
  if (significant.length > 0) {
    const first = significant[0];
    if (significant.length >= 2 && first.length <= 2) {
      const second = significant[1];
      token = (first + second).slice(0, 6);
    } else {
      token = first.slice(0, 6);
    }
  } else if (words.length > 0) {
    token = words[0].slice(0, 6);
  } else {
    token = 'SCH';
  }

  const sanitized = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return sanitized.length > 0 ? sanitized : 'SCH';
}

/**
 * Auto-generate a short administrator ID reflecting the school name
 * with a random suffix to guarantee no conflicts.
 * Format: ADM-<SCHOOL>-<SUFFIX> (e.g. ADM-EAGLE-7K9X)
 */
export function generateAdminLoginId(schoolName: string, suffix?: string): string {
  const prefix = extractSchoolPrefix(schoolName);
  const code = suffix ?? generateShortUniqueSuffix(4);
  return `ADM-${prefix}-${code}`;
}

