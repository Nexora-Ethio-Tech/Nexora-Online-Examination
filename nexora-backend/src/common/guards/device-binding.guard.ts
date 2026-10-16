import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { DbService } from '../db/db.service';
import { ClockService } from '../clock/clock.service';
import { deviceCredential, requireDeviceBinding } from '../crypto/device-credential';
import { hashSha256 } from '../crypto/password';
import { DomainException } from '../errors/domain.exception';

@Injectable()
export class DeviceBindingGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.sessionUser;
    const school = req.school;
    if (!user || !school) throw DomainException.authRequired();
    const credential = deviceCredential(req);
    if (!credential)
      throw DomainException.conflict('DEVICE_REPLACED', 'Device credential cookie missing');
    await this.db.withTenantTransaction(school.id, async (client) => {
      const devices = await client.query<{ device_id: string }>(
        `SELECT device_id FROM device_bindings WHERE school_id = $1 AND user_id = $2 AND credential_hash = $3`,
        [school.id, user.id, hashSha256(credential)],
      );
      const device = devices.rows[0];
      if (!device)
        throw DomainException.conflict('DEVICE_REPLACED', 'Current browser is not enrolled');
      await requireDeviceBinding(client, req, school.id, user.id, device.device_id, () =>
        this.clock.now(),
      );
      req.deviceId = device.device_id;
    });
    return true;
  }
}
