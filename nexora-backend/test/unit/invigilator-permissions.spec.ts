import 'reflect-metadata';
import { expect, it } from 'vitest';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AuthoringController } from '../../src/modules/authoring/authoring.controller';
import { AdministrationController } from '../../src/modules/administration/administration.controller';
import { DirectoryController } from '../../src/modules/directory/directory.controller';
import { AssistanceController } from '../../src/modules/delivery/assistance.controller';

const guard = new RolesGuard();
const request = { sessionUser: { role: 'invigilator' } };
it.each([AuthoringController, AdministrationController, DirectoryController])(
  'denies privileged controller access for limited invigilators (%s)',
  (controller) => {
    const context = new ExecutionContextHost([request], controller, () => undefined);
    expect(() => guard.canActivate(context)).toThrow();
  },
);
it('allows assistance reads but denies assignment management', () => {
  expect(
    guard.canActivate(
      new ExecutionContextHost(
        [request],
        AssistanceController,
        AssistanceController.prototype.sessions,
      ),
    ),
  ).toBe(true);
  expect(() =>
    guard.canActivate(
      new ExecutionContextHost(
        [request],
        AssistanceController,
        AssistanceController.prototype.assign,
      ),
    ),
  ).toThrow();
});
