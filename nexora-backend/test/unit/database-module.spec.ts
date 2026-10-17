import { Test } from '@nestjs/testing';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DbService } from '../../src/common/db/db.service';

it('creates and initializes one database provider for the entire application', async () => {
  const initialize = vi.fn();
  const destroy = vi.fn();
  const createDatabase = vi.fn(() => ({ onModuleInit: initialize, onModuleDestroy: destroy }));
  const app = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DbService)
    .useFactory({ factory: createDatabase })
    .compile();

  try {
    await app.init();
    expect(createDatabase).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
  expect(destroy).toHaveBeenCalledTimes(1);
});
