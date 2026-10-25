import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rosterRows, rosterReference } from '../../src/modules/directory/roster-format';
describe('system-generated roster identities', () => {
  it('reads the actual downloadable Excel template including a blank roll number', async () => {
    const rows = await rosterRows(
      readFileSync(resolve(process.cwd(), '../public/templates/nexora-student-roster.xlsx')),
    );
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      firstName: 'Samuel',
      fatherName: 'Abebe',
      grandfatherName: 'Tesfaye',
      rollNumber: '',
      studentRef: '',
      errors: [],
    });
  });
  it('accepts three name columns with no roll column', async () => {
    const rows = await rosterRows(
      Buffer.from("First name,Father's name,Grandfather's name\nHana,Dawit,Getachew"),
    );
    expect(rows[0]).toMatchObject({
      displayName: 'Hana Dawit Getachew',
      rollNumber: '',
      errors: [],
    });
  });
  it('keeps a roll reference class-scoped and separate from login IDs', async () => {
    const [row] = await rosterRows(
      Buffer.from("Roll number,First name,Father's name,Grandfather's name\n1,Hana,Dawit,Getachew"),
    );
    expect(rosterReference('a', row, 'x')).toBe(rosterReference('a', row, 'y'));
    expect(rosterReference('a', row, 'x')).not.toBe(rosterReference('b', row, 'x'));
    expect(rosterReference('a', row, 'x')).toMatch(/^roster:/);
  });
  it('rejects missing names and unexpected identity columns', async () => {
    const [row] = await rosterRows(
      Buffer.from("First name,Father's name,Grandfather's name\nHana,,Getachew"),
    );
    expect(row.errors.length).toBeGreaterThan(0);
    await expect(rosterRows(Buffer.from('Student ID,Name\n1,Hana'))).rejects.toThrow();
  });
});
