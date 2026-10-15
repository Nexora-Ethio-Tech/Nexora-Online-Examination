import { itemSchema, type Item } from '@/features/exams/authoring/schemas';
import questions from './math20-questions.json';

// Bundled rehearsal data only; the real backend must parse edited uploads.
export function math20Items(): Item[] {
  return itemSchema.array().parse(
    questions.map((q) => ({
      itemId: `demo-${q.externalId.toLowerCase()}`,
      externalId: q.externalId,
      type: q.type,
      stem: q.stem,
      options:
        q.type === 'true_false'
          ? [
              { id: 'true', text: 'True' },
              { id: 'false', text: 'False' },
            ]
          : q.choices.map((text, index) => ({ id: 'ABCD'.charAt(index), text })),
      correctOptionId: q.type === 'true_false' ? q.answer.toLowerCase() : q.answer,
      marks: 2,
      primaryTopic: q.primaryTopic,
      secondaryTopics: [],
      explanation: q.explanation,
      keyConsistent: true,
      reviewFlags:
        q.externalId === 'M20-020'
          ? ['Check that certainty and impossibility are distinguished in the explanation.']
          : [],
      reviewed: false,
      reviewNote: '',
    })),
  );
}
