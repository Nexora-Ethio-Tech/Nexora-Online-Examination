import { expect, it } from 'vitest';
import { generateAccountPassword } from '../../src/common/crypto/account-password';
import { studentLoginId } from '../../src/modules/directory/student-numbering';
import { teacherLoginId } from '../../src/modules/directory/teacher-numbering';

it('generates eight-character passwords containing every required character class', () => {
  for (let i = 0; i < 1000; i++) {
    const password = generateAccountPassword();
    expect(password).toHaveLength(8);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[!#$%&*?]/);
    expect(password).not.toMatch(/^[=+@-]/);
  }
});
it('uses Ethiopian New Year at midnight EAT, not Gregorian New Year or UTC midnight', () => {
  expect(studentLoginId(1, 1, new Date('2026-09-10T20:59:59Z'))).toBe('STU/001/0001/18');
  expect(studentLoginId(234, 8323, new Date('2026-09-10T21:00:00Z'))).toBe('STU/234/8323/19');
  expect(studentLoginId(1, 10000, new Date('2027-01-01T00:00:00Z'))).toBe('STU/001/10000/19');
});
it('pads teacher and school sequences without truncating or reusing numbers', () => {
  expect(teacherLoginId(1, 1)).toBe('TCH/001/0001');
  expect(teacherLoginId(383, 3232)).toBe('TCH/383/3232');
  expect(teacherLoginId(1000, 10000)).toBe('TCH/1000/10000');
  expect(() => teacherLoginId(0, 1)).toThrow();
  expect(() => studentLoginId(1, -1)).toThrow();
});
