import { ApiError } from '@/lib/api-client';
import type { examApi } from './api';
import type { EncryptedPackage, Exam } from './schemas';
import { retainedId, savePackage, storageKey } from './storage';
import { shellBuild, ensureOfflineShell } from '@/lib/offline-shell';
export const preparationSteps = [
  { id: 'eligibility', label: 'Check exam availability' },
  { id: 'attempt', label: 'Register this browser and recover your attempt' },
  { id: 'download', label: 'Download the encrypted paper' },
  { id: 'integrity', label: 'Verify the paper checksum' },
  { id: 'storage', label: 'Save the paper on this device' },
  { id: 'shell', label: 'Check offline app files' },
  { id: 'report', label: 'Report verified preparation to your school' },
] as const;
export type PreparationStep = (typeof preparationSteps)[number]['id'];
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
  onStep?: (step: PreparationStep) => void,
) {
  const step = (value: PreparationStep) => {
    signal?.throwIfAborted();
    onStep?.(value);
  };
  // Re-read schedule before any write. Server still enforces every timing boundary.
  signal?.throwIfAborted();
  step('eligibility');
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
  step('attempt');
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
  step('download');
  const packet = await api.package(attempt.attemptId, signal);
  step('integrity');
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
  step('storage');
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
  step('shell');
  let shell: 'ready' | 'development';
  try {
    shell = await ensureOfflineShell();
  } catch (error) {
    throw new ApiError(
      'SHELL_UNAVAILABLE',
      error instanceof Error ? error.message : 'Offline app preparation failed.',
    );
  }
  signal?.throwIfAborted();
  if (shell === 'ready') {
    step('report');
    const body = {
      packageId: packet.packageId,
      sha256: packet.sha256,
      examVersion: attempt.examVersion,
      scheduleRevision: attempt.scheduleRevision,
      deviceGeneration: attempt.deviceGeneration,
      shellBuild,
    };
    const key = await retainedId(
      storageKey(
        owner.schoolId,
        owner.userId,
        attempt.attemptId,
        JSON.stringify(body),
        'readiness',
      ),
    );
    const response = await api.ready(attempt.attemptId, body, key, signal);
    if (
      response.attemptId !== attempt.attemptId ||
      Object.entries(body).some(
        ([field, value]) => response.readiness[field as keyof typeof body] !== value,
      )
    )
      throw new ApiError(
        'READINESS_MISMATCH',
        'The preparation report did not match this browser. Retry preparation.',
      );
    signal?.throwIfAborted();
  }
  return { attempt, packageId: packet.packageId, shell };
}
