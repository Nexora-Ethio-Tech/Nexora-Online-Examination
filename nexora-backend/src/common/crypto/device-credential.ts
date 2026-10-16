import { Request } from 'express';
import { PoolClient } from 'pg';
import { hashSha256 } from './password';
import { DomainException } from '../errors/domain.exception';

export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function deviceCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-nexora_device' : 'nexora_device_cred';
}

export function deviceCredential(req: Request): string | undefined {
  const value: unknown = req.cookies?.[deviceCookieName()];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function requireDeviceBinding(
  client: PoolClient,
  req: Request,
  schoolId: string,
  studentId: string,
  deviceId: string,
  now: () => Date,
): Promise<void> {
  const credential = deviceCredential(req);
  const suppliedId = req.get('X-Device-Id');
  if (!credential || (suppliedId && suppliedId !== deviceId)) {
    throw DomainException.conflict('DEVICE_REPLACED', 'Current browser enrollment is required');
  }

  const result = await client.query<{ device_id: string; expires_at: Date }>(
    `SELECT d.device_id, b.expires_at
     FROM device_bindings d
     JOIN browser_devices b ON b.device_id = d.device_id
     JOIN users u ON u.id = d.user_id AND u.school_id = d.school_id
     JOIN schools s ON s.id = d.school_id
     WHERE d.school_id = $1 AND d.user_id = $2 AND d.device_id = $3
       AND d.credential_hash = $4 AND b.credential_hash = $4
       AND b.revoked_at IS NULL AND b.expires_at > $5
       AND u.status = 'active' AND u.role = 'student' AND s.status = 'active'
     FOR SHARE OF b, d, u, s`,
    [schoolId, studentId, deviceId, hashSha256(credential), now()],
  );
  if (!result.rows[0] || result.rows[0].expires_at <= now()) {
    throw DomainException.conflict('DEVICE_REPLACED', 'Current browser enrollment is required');
  }
}
