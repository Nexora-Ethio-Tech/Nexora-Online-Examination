import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  generationEnabled,
  lockGenerationPolicy,
} from '../../src/modules/authoring/generation.service';
class PolicyClient extends Client {
  release() {}
}
describe('generation policy at worker boundaries', () => {
  it('defaults to disabled and requires the admitted revision even after re-enabling', async () => {
    const client = new PolicyClient();
    const query = vi.spyOn(client, 'query');
    const result = (rows: { enabled: boolean; revision: number }[]) => ({
      rows,
      rowCount: rows.length,
      fields: [],
      command: 'SELECT',
      oid: 0,
    });
    query.mockResolvedValueOnce(result([]));
    expect(await generationEnabled(client, 'school')).toBe(false);
    query.mockResolvedValueOnce(result([{ enabled: false, revision: 3 }]));
    expect(await generationEnabled(client, 'school', 2)).toBe(false);
    query.mockResolvedValueOnce(result([{ enabled: true, revision: 4 }]));
    expect(await generationEnabled(client, 'school', 2)).toBe(false);
    query.mockResolvedValueOnce(result([{ enabled: true, revision: 4 }]));
    expect(await generationEnabled(client, 'school', 4)).toBe(true);
    expect(query.mock.calls.every((call) => call[1]?.[0] === 'school')).toBe(true);
  });
  it('uses the same school-scoped transaction lock for settings and generation', async () => {
    const client = new PolicyClient();
    const query = vi
      .spyOn(client, 'query')
      .mockResolvedValue({ rows: [], rowCount: 0, fields: [], command: 'SELECT', oid: 0 });
    await lockGenerationPolicy(client, 'school');
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      'school:exam-generation',
    ]);
  });
});
