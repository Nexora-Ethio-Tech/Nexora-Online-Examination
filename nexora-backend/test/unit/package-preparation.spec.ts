import { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { DbService } from '../../src/common/db/db.service';
import { PackageWorkerService } from '../../src/modules/authoring/package-worker.service';
import { unwrapPackageKey } from '../../src/common/crypto/package-key';
import { decryptExamPackage } from '../../src/common/crypto/package-cipher';
class PackageClient extends Client {
  release() {}
}
const empty = { rows: [], rowCount: 0, fields: [], command: 'SELECT', oid: 0 };
const rows = (values: unknown[]) => ({ ...empty, rows: values, rowCount: values.length });
const item = {
  itemId: 'item-1',
  type: 'mcq_single',
  stem: '2 + 2?',
  options: [
    { id: 'A', text: '4' },
    { id: 'B', text: '5' },
  ],
  marks: 2,
};
function setup(items: unknown[] = [item]) {
  vi.stubEnv('MFA_ENCRYPTION_KEY', randomBytes(32).toString('base64url'));
  const client = new PackageClient();
  const query = vi.spyOn(client, 'query').mockResolvedValue(empty);
  query
    .mockResolvedValueOnce(rows([{ id: 'job', exam_version_id: 'version' }]))
    .mockResolvedValueOnce(empty)
    .mockResolvedValueOnce(empty)
    .mockResolvedValueOnce(rows([{ id: 'job' }]))
    .mockResolvedValueOnce(
      rows([{ version: 1, title: 'Frozen title', instructions: 'Answer all.' }]),
    )
    .mockResolvedValueOnce(rows(items));
  return { client, query, worker: new PackageWorkerService(new DbService()) };
}
afterEach(() => vi.unstubAllEnvs());
describe('immediate approved package preparation', () => {
  it('finishes inside the caller transaction without an AI or scheduler call and wraps the key', async () => {
    const { client, query, worker } = setup();
    expect(await worker.prepareNow(client, 'school', 'version')).toBe(true);
    const insert = query.mock.calls.find((call) =>
      String(call[0]).startsWith('INSERT INTO exam_packages'),
    );
    expect(insert).toBeDefined();
    const values = z.array(z.string()).parse(insert?.[1]);
    const key = unwrapPackageKey(values[5], 'school', 'version');
    expect(decryptExamPackage(values[3], values[2], key)).toEqual({
      examVersion: 1,
      title: 'Frozen title',
      instructions: 'Answer all.',
      items: [item],
    });
    expect(values[5]).toMatch(/^pk1\./);
    expect(query.mock.calls.some((call) => String(call[0]).includes("SET status='ready'"))).toBe(
      true,
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe('RELEASE SAVEPOINT immediate_student_package');
  });
  it('refuses private fields and records a visible failure while preserving the outer approval transaction', async () => {
    const { client, query, worker } = setup([
      { ...item, correct_key: 'A', explanation: 'Private' },
    ]);
    await worker.prepareNow(client, 'school', 'version');
    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements).toContain('ROLLBACK TO SAVEPOINT immediate_student_package');
    expect(statements.some((sql) => sql.startsWith('INSERT INTO exam_packages'))).toBe(false);
    expect(statements.some((sql) => sql.includes("SET status='failed'"))).toBe(true);
    expect(statements).not.toContain('ROLLBACK');
  });
  it('rolls back failed SQL before recording failure so approval can still commit', async () => {
    const { client, query, worker } = setup();
    query.mockRejectedValueOnce(new Error('synthetic database failure'));
    await worker.prepareNow(client, 'school', 'version');
    const statements = query.mock.calls.map((call) => String(call[0]));
    const rollback = statements.indexOf('ROLLBACK TO SAVEPOINT immediate_student_package');
    const failed = statements.findIndex((sql) => sql.includes("SET status='failed'"));
    expect(rollback).toBeGreaterThan(-1);
    expect(failed).toBeGreaterThan(rollback);
    expect(statements.some((sql) => sql.includes("SET status='ready'"))).toBe(false);
  });
  it('leaves ready jobs and unexpired worker leases alone', async () => {
    const client = new PackageClient();
    const query = vi.spyOn(client, 'query').mockResolvedValue(empty);
    const worker = new PackageWorkerService(new DbService());
    expect(await worker.prepareNow(client, 'school', 'version')).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain('lease_until<now()');
  });
});
