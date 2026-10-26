import { describe, it, expect } from 'vitest';
import {
  structureSchema,
  structureProblems,
  blocksSchema,
} from '../../src/modules/authoring/content-schema';
import { questionOrder } from '../../src/modules/delivery/question-order';
const structure = {
  sections: [
    { id: 'a', title: 'Part A', type: 'mcq_single' as const, shuffle: true, blocks: [] },
    { id: 'b', title: 'Part B', type: 'true_false' as const, shuffle: true, blocks: [] },
  ],
  passages: [{ id: 'p', sectionId: 'a', title: 'Read', blocks: [] }],
};
describe('structured content integrity', () => {
  it('rejects orphan passages and inconsistent tables', () => {
    expect(
      structureSchema.safeParse({
        ...structure,
        passages: [{ ...structure.passages[0], sectionId: 'missing' }],
      }).success,
    ).toBe(false);
    expect(
      blocksSchema.safeParse([{ id: 't', kind: 'table', headers: ['A'], rows: [['a', 'b']] }])
        .success,
    ).toBe(false);
  });
  it('rejects external images and hidden private fields', () => {
    expect(
      blocksSchema.safeParse([
        { id: 'x', kind: 'image', data: 'https://example.com/x.png', alt: 'x', caption: '' },
      ]).success,
    ).toBe(false);
    expect(
      blocksSchema.safeParse([{ id: 'x', kind: 'text', text: 'hello', answer: 'A' }]).success,
    ).toBe(false);
  });
  it('validates section types and passage membership', () => {
    expect(
      structureProblems(structure, [
        { itemId: 'q', type: 'true_false', sectionId: 'a', passageId: 'p' },
      ]),
    ).not.toHaveLength(0);
    expect(
      structureProblems(structure, [
        { itemId: 'q', type: 'mcq_single', sectionId: 'a', passageId: 'p' },
      ]),
    ).toEqual([]);
  });
  it('keeps instructions, passage groups and types separate when shuffled', () => {
    const items = [
      { item_id: 'a1', type: 'mcq_single', section_id: 'a' },
      { item_id: 'a2', type: 'mcq_single', section_id: 'a' },
      { item_id: 'p1', type: 'mcq_single', section_id: 'a', passage_id: 'p' },
      { item_id: 'p2', type: 'mcq_single', section_id: 'a', passage_id: 'p' },
      { item_id: 'b1', type: 'true_false', section_id: 'b' },
    ];
    expect(questionOrder(items, structure, true, () => 0)).toEqual(['a2', 'a1', 'p2', 'p1', 'b1']);
    expect(questionOrder(items, structure, false, () => 0)).toEqual(items.map((i) => i.item_id));
    expect(
      questionOrder(
        items,
        { ...structure, sections: structure.sections.map((s) => ({ ...s, shuffle: false })) },
        true,
        () => 0,
      ),
    ).toEqual(items.map((i) => i.item_id));
  });
});
