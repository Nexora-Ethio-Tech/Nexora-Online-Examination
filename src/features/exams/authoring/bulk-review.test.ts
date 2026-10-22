import { describe, expect, it } from 'vitest';
import { eligibleForBulkReview } from './schemas';
import { sampleItems } from '@/mocks/teacher';

describe('bulk confirmation eligibility', () => {
  it('accepts complete unconfirmed questions but excludes warnings even with a note', () => {
    const original = sampleItems()[0];
    if (!original) throw new Error('Missing fixture');
    const item = { ...original, reviewed: false, reviewFlags: [], keyConsistent: true };
    expect(eligibleForBulkReview(item)).toBe(true);
    expect(
      eligibleForBulkReview({ ...item, reviewFlags: ['Ambiguous'], reviewNote: 'Checked' }),
    ).toBe(false);
    expect(eligibleForBulkReview({ ...item, keyConsistent: false, reviewNote: 'Checked' })).toBe(
      false,
    );
    expect(eligibleForBulkReview({ ...item, explanation: '' })).toBe(false);
    expect(eligibleForBulkReview({ ...item, reviewed: true })).toBe(false);
  });
});
