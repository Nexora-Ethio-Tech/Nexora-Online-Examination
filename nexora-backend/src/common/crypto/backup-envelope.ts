import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const magic = Buffer.from('NEXORA-BACKUP-V1\n');
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;

function key(encoded: string | undefined) {
  const value = Buffer.from(encoded ?? '', 'base64url');
  if (value.length !== 32 || value.toString('base64url') !== encoded)
    throw new Error('BACKUP_ENCRYPTION_KEY must be a dedicated 32-byte base64url key');
  return value;
}

export function encryptBackup(archive: Buffer, encodedKey: string | undefined) {
  if (!archive.length || archive.length > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds the supported archive size');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(encodedKey), nonce);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([magic, nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackup(envelope: Buffer, encodedKey: string | undefined) {
  if (
    envelope.length <= magic.length + 28 ||
    envelope.length > MAX_BACKUP_BYTES + magic.length + 28 ||
    !envelope.subarray(0, magic.length).equals(magic)
  )
    throw new Error('Invalid backup envelope');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(encodedKey),
    envelope.subarray(magic.length, magic.length + 12),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(envelope.subarray(magic.length + 12, magic.length + 28));
  // Nothing is sent to a database until authentication succeeds.
  return Buffer.concat([decipher.update(envelope.subarray(magic.length + 28)), decipher.final()]);
}
