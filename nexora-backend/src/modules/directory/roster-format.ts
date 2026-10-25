import { createHash } from 'crypto';
import { parseTemplateRows } from '../authoring/import-parser';
import { parseRosterCsv } from './roster-csv';

export async function rosterRows(buffer: Buffer) {
  const xlsx = buffer[0] === 0x50 && buffer[1] === 0x4b;
  let rows = xlsx
    ? await parseTemplateRows(buffer, {
        sheetName: 'Students',
        columns: 4,
        maxRows: 2001,
        allowDocx: false,
      })
    : parseRosterCsv(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  if (xlsx && rows[0]?.[3] === '') rows = rows.map((row) => row.slice(0, 3));
  const header = rows[0]?.map((s) => s.trim()).join(',');
  const legacy = header === 'studentRef,displayName';
  const roll = header === "Roll number,First name,Father's name,Grandfather's name";
  if (!legacy && !roll && header !== "First name,Father's name,Grandfather's name")
    throw new Error('Use the downloadable roster headers');
  return rows.slice(1).map((cells, index) => {
    const names = legacy ? [] : cells.slice(roll ? 1 : 0).map((s) => s.normalize('NFC').trim());
    const rollNumber = roll ? cells[0].trim() : '';
    const displayName = legacy ? (cells[1] ?? '').trim() : names.join(' ');
    const errors: { field: string; message: string }[] = [];
    if (cells.length !== (legacy ? 2 : roll ? 4 : 3))
      errors.push({ field: 'row', message: 'Unexpected number of columns' });
    if (!legacy && names.some((n) => !n || n.length > 50))
      errors.push({ field: 'name', message: 'Enter all three names, up to 50 characters each' });
    if (rollNumber.length > 40)
      errors.push({ field: 'rollNumber', message: 'Roll number must be at most 40 characters' });
    if (!displayName || displayName.length > 160)
      errors.push({ field: 'name', message: 'Use a full name of 1–160 characters' });
    return {
      row: index + 2,
      studentRef: legacy ? cells[0].trim() : '',
      displayName,
      rollNumber,
      firstName: names[0],
      fatherName: names[1],
      grandfatherName: names[2],
      errors,
      legacy,
    };
  });
}

/** Stable private import identity is separate from the generated login ID. */
export function rosterReference(
  classId: string,
  row: Awaited<ReturnType<typeof rosterRows>>[number],
  fileHash: string,
) {
  if (row.legacy) return row.studentRef;
  return (
    'roster:' +
    createHash('sha256')
      .update(
        JSON.stringify([classId, row.rollNumber || fileHash, row.rollNumber ? null : row.row]),
      )
      .digest('hex')
  );
}
