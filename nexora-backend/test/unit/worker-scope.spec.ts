import { describe, expect, it } from 'vitest';
import { workerSchoolIds } from '../../src/modules/authoring/worker-scope';

describe('worker operator school scope', () => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  it('sorts and deduplicates the scope for stable cursor traversal', () => {
    expect(workerSchoolIds(` ${second},${first},${second} `)).toEqual([first, second]);
  });
  it('fails visibly for missing, malformed or excessive scope', () => {
    for (const value of ['', '  ', 'not-a-uuid', `${first},`, Array(1001).fill(first).join(',')])
      expect(() => workerSchoolIds(value)).toThrow();
  });
});
