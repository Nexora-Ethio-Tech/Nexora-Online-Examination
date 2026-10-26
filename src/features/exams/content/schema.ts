import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const blockSchema = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('text'), text: z.string().max(20000) }).strict(),
  z
    .object({
      id,
      kind: z.literal('image'),
      data: z
        .string()
        .max(280000)
        .regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/),
      alt: z.string().trim().min(1).max(500),
      caption: z.string().max(1000),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal('table'),
      headers: z.array(z.string().max(500)).min(1).max(10),
      rows: z.array(z.array(z.string().max(2000)).min(1).max(10)).max(30),
    })
    .strict(),
]);
export const blocksSchema = z
  .array(blockSchema)
  .max(20)
  .superRefine((blocks, ctx) => {
    if (new Set(blocks.map((b) => b.id)).size !== blocks.length)
      ctx.addIssue({ code: 'custom', message: 'Content block IDs must be unique.' });
    for (const b of blocks)
      if (b.kind === 'table' && b.rows.some((r) => r.length !== b.headers.length))
        ctx.addIssue({ code: 'custom', message: 'Every table row must match the column count.' });
  });
export const structureSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            id,
            title: z.string().trim().min(1).max(160),
            type: z.enum(['mcq_single', 'true_false']),
            shuffle: z.boolean(),
            blocks: blocksSchema,
          })
          .strict(),
      )
      .max(40),
    passages: z
      .array(
        z
          .object({
            id,
            sectionId: id,
            title: z.string().trim().min(1).max(160),
            blocks: blocksSchema,
          })
          .strict(),
      )
      .max(80),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sections = new Set(value.sections.map((s) => s.id));
    if (
      sections.size !== value.sections.length ||
      new Set(value.passages.map((p) => p.id)).size !== value.passages.length
    )
      ctx.addIssue({ code: 'custom', message: 'Section and passage IDs must be unique.' });
    if (value.passages.some((p) => !sections.has(p.sectionId)))
      ctx.addIssue({ code: 'custom', message: 'Each passage must belong to a section.' });
  });
export type ContentBlock = z.infer<typeof blockSchema>;
export type Structure = z.infer<typeof structureSchema>;
export function structureProblems(
  structure: Structure,
  items: { itemId: string; type: string; sectionId?: string | null; passageId?: string | null }[],
) {
  const errors: string[] = [];
  if (new Set(items.map((i) => i.itemId)).size !== items.length)
    errors.push('Question IDs must be unique.');
  for (const item of items) {
    const section = structure.sections.find((s) => s.id === item.sectionId);
    const passage = structure.passages.find((p) => p.id === item.passageId);
    if (structure.sections.length && (!section || section.type !== item.type))
      errors.push('Every question needs a section matching its question type.');
    if (!structure.sections.length && item.sectionId) errors.push('Unknown section.');
    if (item.passageId && (!passage || passage.sectionId !== item.sectionId))
      errors.push('Each passage question must belong to the passage section.');
  }
  return [...new Set(errors)];
}
