import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbService } from '../../src/common/db/db.service';
import { ImportWorkerService } from '../../src/modules/authoring/import-worker.service';
import { PackageWorkerService } from '../../src/modules/authoring/package-worker.service';
import { WorkerSweepService } from '../../src/modules/authoring/worker-sweep.service';
import { ImportWorkerController } from '../../src/modules/authoring/import.controller';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  imports: vi.fn(),
  packages: vi.fn(),
}));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    tenantQuery = mocks.query;
  },
}));
vi.mock('../../src/modules/authoring/import-worker.service', () => ({
  ImportWorkerService: class {
    run = mocks.imports;
  },
}));
vi.mock('../../src/modules/authoring/package-worker.service', () => ({
  PackageWorkerService: class {
    run = mocks.packages;
  },
}));

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
function sweep() {
  // Prototype instances intentionally skip constructors; mocks provide all dependencies.
  return new WorkerSweepService(
    Object.assign(Object.create(DbService.prototype), { tenantQuery: mocks.query }),
    Object.assign(Object.create(ImportWorkerService.prototype), { run: mocks.imports }),
    Object.assign(Object.create(PackageWorkerService.prototype), { run: mocks.packages }),
  );
}

describe('bounded school worker sweep', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  function setup() {
    vi.stubEnv('WORKER_SCHOOL_IDS', `${first},${second}`);
    const service = sweep();
    // No database connection is created in these tests.
    mocks.packages.mockResolvedValue(true);
    mocks.imports.mockResolvedValue({ parsed: true, aiProcessed: 1 });
    return service;
  }

  it('processes one active school and returns a cursor instead of unbounded work', async () => {
    const service = setup();
    mocks.query.mockResolvedValue({ rows: [{ id: first }, { id: second }] });
    expect(await service.run({})).toEqual({
      parsed: true,
      aiProcessed: 1,
      packageProcessed: true,
      nextCursor: first,
    });
    expect(mocks.packages).toHaveBeenCalledExactlyOnceWith(first);
    expect(mocks.imports).toHaveBeenCalledExactlyOnceWith(first);
    expect(mocks.packages.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.imports.mock.invocationCallOrder[0],
    );
    expect(mocks.query.mock.calls[0][0]).toBe(first);
    expect(mocks.query.mock.calls[0][1]).toContain("status = 'active'");
    expect(mocks.query.mock.calls[0][2]).toEqual([first]);
  });

  it('advances past the cursor and finishes when no more schools exist', async () => {
    const service = setup();
    mocks.query.mockResolvedValue({ rows: [{ id: second }] });
    expect((await service.run({ afterSchoolId: first })).nextCursor).toBeNull();
    expect(mocks.query.mock.calls[0][0]).toBe(second);
    expect(mocks.imports).toHaveBeenCalledWith(second);
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.imports.mockClear();
    expect((await service.run({ schoolId: first })).parsed).toBe(false);
    expect(mocks.imports).not.toHaveBeenCalled();
  });

  it('rejects malformed and ambiguous scope before accessing the database', async () => {
    const service = setup();
    for (const input of [
      { schoolId: 'bad-id' },
      { schoolId: first, afterSchoolId: second },
      { limit: 1000 },
    ]) {
      await expect(service.run(input)).rejects.toThrow();
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('skips an inactive school without losing the continuation cursor', async () => {
    const service = setup();
    mocks.query.mockResolvedValue({ rows: [] });
    expect(await service.run({})).toMatchObject({ parsed: false, nextCursor: first });
    expect(mocks.imports).not.toHaveBeenCalled();
    expect(mocks.packages).not.toHaveBeenCalled();
  });

  it('fails on missing sweep configuration but permits explicit trusted scope', async () => {
    const service = setup();
    vi.stubEnv('WORKER_SCHOOL_IDS', '');
    await expect(service.run({})).rejects.toThrow('WORKER_SCHOOL_IDS_REQUIRED');
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.query.mockResolvedValue({ rows: [{ id: first }] });
    await service.run({ schoolId: first });
    expect(mocks.query.mock.calls[0][0]).toBe(first);
  });

  it('authenticates cron and external triggers before selecting a school', async () => {
    const service = setup();
    const run = vi.spyOn(service, 'run').mockResolvedValue({
      parsed: false,
      aiProcessed: 0,
      packageProcessed: false,
      nextCursor: null,
    });
    const controller = new ImportWorkerController(service);
    vi.stubEnv('CRON_SECRET', 'c'.repeat(32));
    vi.stubEnv('IMPORT_WORKER_SECRET', 'p'.repeat(32));
    await expect(controller.cron(undefined, {})).rejects.toThrow();
    await expect(controller.cron(`Bearer ${'p'.repeat(32)}`, {})).rejects.toThrow();
    await expect(controller.run(`Bearer ${'c'.repeat(32)}`, {})).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    await controller.cron(`Bearer ${'c'.repeat(32)}`, { schoolId: first });
    expect(run).toHaveBeenLastCalledWith({ schoolId: first });
    vi.stubEnv('CRON_SECRET', '');
    await expect(controller.cron('Bearer ', {})).rejects.toThrow();
  });
});
