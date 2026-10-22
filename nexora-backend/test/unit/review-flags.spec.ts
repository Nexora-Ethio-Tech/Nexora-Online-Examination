import { describe, expect, it } from 'vitest';
import { actionableReviewFlags } from '../../src/modules/authoring/review-flags';

describe('review warning classification', () => {
  it('removes known metadata advice and positive comments, not substantive warnings', () => {
    expect(
      actionableReviewFlags([
        'No supplied topic names.',
        'Question is clear and key matches the correct answer.',
        'Two options could be correct.',
        'Missing key',
        'Two options could be correct.',
      ]),
    ).toEqual(['Two options could be correct.', 'Missing key']);
  });
  it('preserves unfamiliar and mixed warnings rather than guessing their meaning', () => {
    expect(
      actionableReviewFlags(['No supplied topic names; answer B is incorrect', 'መልሱ የተሳሳተ ነው']),
    ).toHaveLength(2);
  });
});
