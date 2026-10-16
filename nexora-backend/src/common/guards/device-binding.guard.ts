import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';
import { DbService } from '../db/db.service';
import { hashSha256 } from '../crypto/password';
import { DomainException } from '../errors/domain.exception';

@Injectable()
export class DeviceBindingGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.sessionUser;
    const school = req.school;

    if (!user || !school) {
      throw DomainException.authRequired();
    }

    // Retrieve device credential cookie
    const deviceCred = req.cookies?.['nexora_device_cred'];
    if (!deviceCred) {
      throw DomainException.conflict(
        'DEVICE_REPLACED',
        'Device credential cookie missing',
      );
    }

    const credHash = hashSha256(deviceCred);
    const deviceId =
      (req.headers['x-device-id'] as string) ||
      (req.body?.deviceId as string) ||
      (req.query?.deviceId as string);

    let result;
    if (deviceId) {
      result = await this.db.query(
        `SELECT id, device_id, credential_hash
         FROM device_bindings
         WHERE school_id = $1 AND user_id = $2 AND device_id = $3`,
        [school.id, user.id, deviceId],
      );
      if (result.rows.length === 0 || result.rows[0].credential_hash !== credHash) {
        throw DomainException.conflict(
          'DEVICE_REPLACED',
          'Active device binding does not match current credential',
        );
      }
    } else {
      result = await this.db.query(
        `SELECT id, device_id, credential_hash
         FROM device_bindings
         WHERE school_id = $1 AND user_id = $2 AND credential_hash = $3`,
        [school.id, user.id, credHash],
      );
      if (result.rows.length === 0) {
        throw DomainException.conflict(
          'DEVICE_REPLACED',
          'No enrolled device found for current credential',
        );
      }
    }

    // Attach resolved deviceId to request
    (req as any).deviceId = result.rows[0].device_id;

    // Update last seen
    await this.db.query(
      `UPDATE device_bindings SET last_seen_at = NOW() WHERE id = $1`,
      [result.rows[0].id],
    );

    return true;
  }
}
