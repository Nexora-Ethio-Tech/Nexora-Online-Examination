import { ApiError } from '@/lib/api-client';
import type { examApi } from './api';
import type { EncryptedPackage, Exam } from './schemas';
import { retainedId, savePackage, storageKey } from './storage';
import { ensureOfflineShell } from '@/lib/offline-shell';
export function decodeBase64url(value: string) {
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
  return bytes;
}
export async function verifyPackage(value: EncryptedPackage) {
  const bytes = decodeBase64url(value.ciphertext);
  if (bytes.length < 16 || decodeBase64url(value.iv).length !== 12)
    throw new Error('Invalid encrypted package.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digest = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  if (digest !== value.sha256) throw new Error('Paper checksum did not match.');
}
export async function preparePaper(
  api: ReturnType<typeof examApi>,
  owner: { schoolId: string; userId: string },
  exam: Exam,
  signal?: AbortSignal,
) {
  // Re-read schedule before any write. Server still enforces every timing boundary.
  signal?.throwIfAborted();
  const current = (await api.detail(exam.sessionId, signal)).exam;
  if (
    current.sessionId !== exam.sessionId ||
    !['preparing', 'open'].includes(current.phase) ||
    (current.attemptState && current.attemptState !== 'preparing')
  )
    throw new ApiError(
      'STATE_CHANGED',
      'This sitting is no longer available for preparation. Refresh its schedule.',
    );
  let deviceId: string;
  let requestId: string;
  try {
    deviceId = await retainedId('browser-device');
    requestId = await retainedId(
      storageKey(owner.schoolId, owner.userId, current.sessionId, 'create-attempt'),
    );
  } catch {
    throw new ApiError(
      'STORAGE_UNAVAILABLE',
      'Browser storage is unavailable. Enable site storage before preparing your paper.',
    );
  }
  signal?.throwIfAborted();
  const enrolled = await api.enroll(deviceId, signal);
  if (enrolled.deviceId !== deviceId)
    throw new ApiError(
      'INVALID_DEVICE',
      'Device enrollment did not match this browser. Contact your school.',
    );
  const created = await api.create(current.sessionId, deviceId, requestId, signal);
  const attempt = await api.attempt(created.attemptId, signal);
  if (
    attempt.sessionId !== current.sessionId ||
    attempt.attemptId !== created.attemptId ||
    (current.attemptId !== null && current.attemptId !== attempt.attemptId) ||
    attempt.scheduleRevision !== current.scheduleRevision ||
    attempt.state !== 'preparing'
  )
    throw new ApiError(
      'STATE_CHANGED',
      'The attempt changed. Refresh the schedule before continuing.',
    );
  const packet = await api.package(attempt.attemptId, signal);
  if (
    packet.examVersion !== attempt.examVersion ||
    packet.scheduleRevision !== attempt.scheduleRevision
  )
    throw new ApiError(
      'VERSION_CHANGED',
      'The paper version changed. Refresh the schedule and prepare again.',
    );
  try {
    await verifyPackage(packet);
  } catch {
    throw new ApiError(
      'PACKAGE_INTEGRITY',
      'The paper failed its integrity check. Download it again while connected.',
    );
  }
  signal?.throwIfAborted();
  try {
    await savePackage(
      storageKey(
        owner.schoolId,
        owner.userId,
        current.sessionId,
        attempt.attemptId,
        attempt.examVersion,
        attempt.scheduleRevision,
        attempt.deviceGeneration,
      ),
      packet,
    );
  } catch {
    throw new ApiError(
      'STORAGE_UNAVAILABLE',
      'The paper could not be saved on this device. Free browser storage and try again.',
    );
  }
  let shell: 'ready' | 'development';
  try {
    shell = await ensureOfflineShell();
  } catch (error) {
    throw new ApiError(
      'SHELL_UNAVAILABLE',
      error instanceof Error ? error.message : 'Offline app preparation failed.',
    );
  }
  return { attempt, packageId: packet.packageId, shell };
}
