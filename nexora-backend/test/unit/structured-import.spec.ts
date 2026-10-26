import { it, expect } from 'vitest';
import { zipFixture } from '../zip-fixture';
import { parseStructuredQuestionFile } from '../../src/modules/authoring/import-parser';
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
  'section',
  'section_instructions',
  'passage_title',
  'passage_text',
];
function source(rows: string[][]) {
  return zipFixture([
    [
      'word/document.xml',
      '<w:document xmlns:w="urn:test"><w:body><w:tbl>' +
        [headers, ...rows]
          .map(
            (row) =>
              '<w:tr>' +
              row.map((c) => '<w:tc><w:p><w:r><w:t>' + c + '</w:t></w:r></w:p></w:tc>').join('') +
              '</w:tr>',
          )
          .join('') +
        '</w:tbl></w:body></w:document>',
    ],
  ]);
}
const row = [
  'Q1',
  'mcq_single',
  'What freezes?',
  'Water',
  'Fire',
  '',
  '',
  'A',
  '1',
  'Reading',
  'Choose one',
  'Water passage',
  'Water freezes.',
];
it('imports explicit passage references and shared instructions without guessing topics', async () => {
  const result = await parseStructuredQuestionFile(source([row, ['Q2', ...row.slice(1)]]));
  expect(result.structure.sections).toHaveLength(1);
  expect(result.structure.passages).toHaveLength(1);
  expect(result.items[0].passageId).toBe(result.items[1].passageId);
  expect(result.items[0].sectionId).toBe(result.structure.sections[0].id);
});
it('rejects conflicting passage text instead of silently choosing a version', async () => {
  const other = [...row];
  other[0] = 'Q2';
  other[12] = 'Different passage';
  await expect(parseStructuredQuestionFile(source([row, other]))).rejects.toThrow();
});
