import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { parseQuestionFile } from '../../src/modules/authoring/import-parser';
import { zipFixture } from '../zip-fixture';

const headers = [
  'external_id',
  'type',
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'answer',
  'marks',
];
const sample = ['one', 'true_false', '2 + 2 = 4', '', '', '', '', 'TRUE', '2'];
function document(rows: string[][], extra = '') {
  return `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Plain introduction</w:t></w:r></w:p><w:tbl>${[headers, ...rows].map((row) => `<w:tr>${row.map((value) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${extra}</w:body></w:document>`;
}

describe('bounded real template import', () => {
  it('reads the same objective questions from the distributed DOCX and XLSX', async () => {
    const doc = await parseQuestionFile(
      readFileSync(resolve('../public/templates/nexora-questions.docx')),
    );
    const sheet = await parseQuestionFile(
      readFileSync(resolve('../public/templates/nexora-questions.xlsx')),
    );
    const content = (items: typeof doc) =>
      items.map(({ itemId, ...item }) => ({ ...item, itemId: Boolean(itemId) }));
    expect(content(doc)).toEqual(content(sheet));
    expect(doc).toHaveLength(2);
    expect(doc.map((i) => i.correctOptionId)).toEqual(['B', 'true']);
    expect(doc.reduce((sum, i) => sum + i.marks, 0)).toBe(4);
  });
  it('reads the twenty-question math example', async () => {
    const items = await parseQuestionFile(
      readFileSync(resolve('../public/templates/nexora-math-20-demo.xlsx')),
    );
    expect(items).toHaveLength(20);
    expect(items.every((i) => !i.reviewed && i.keyConsistent === null)).toBe(true);
  });
  it('rejects non-ZIP and oversized input', async () => {
    await expect(parseQuestionFile(Buffer.from('not a zip'))).rejects.toThrow(
      'Question import failed validation',
    );
    await expect(parseQuestionFile(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow(
      'Question import failed validation',
    );
  });
  it('retains Unicode and reports every invalid row without partial import', async () => {
    const unicode = [...sample];
    unicode[2] = 'ሁለት እና ሁለት አራት ነው';
    expect(
      (await parseQuestionFile(zipFixture([['word/document.xml', document([unicode])]])))[0].stem,
    ).toBe(unicode[2]);
    const invalid = [...sample];
    invalid[7] = 'A';
    invalid[8] = '1.5';
    await expect(
      parseQuestionFile(zipFixture([['word/document.xml', document([sample, invalid])]])),
    ).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ row: 3, field: 'external_id' }),
        expect.objectContaining({ row: 3, field: 'answer' }),
        expect.objectContaining({ row: 3, field: 'marks' }),
      ]),
    });
  });
  it('rejects external relationships, embedded objects, entities and merged cells', async () => {
    const base: [string, string] = ['word/document.xml', document([sample])];
    for (const entries of [
      [
        base,
        [
          'word/_rels/document.xml.rels',
          '<Relationships><Relationship TargetMode="External" Target="https://example.com"/></Relationships>',
        ],
      ],
      [base, ['word/media/image.png', 'binary']],
      [['word/document.xml', '<!DOCTYPE doc [<!ENTITY injected "x">]>' + document([sample])]],
      [['word/document.xml', document([sample], '<w:gridSpan w:val="2"/>')]],
    ] satisfies [string, string][][]) {
      await expect(parseQuestionFile(zipFixture(entries))).rejects.toThrow(
        'Question import failed validation',
      );
    }
  });
  it('rejects traversal, duplicate entries and excessive archive entries', async () => {
    await expect(parseQuestionFile(zipFixture([['../escape.xml', '<x/>']]))).rejects.toThrow();
    await expect(
      parseQuestionFile(
        zipFixture([
          ['word/document.xml', document([sample])],
          ['word/document.xml', document([sample])],
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      parseQuestionFile(zipFixture(Array.from({ length: 1001 }, (_, i) => [`${i}.xml`, '<x/>']))),
    ).rejects.toThrow();
  });
});
