import type { Attempt, EncryptedPackage } from '@/features/exams/schemas';
import { decodeBase64url, verifyPackage } from '@/features/exams/preparation';
import { finalSchema, paperSchema, type FinalBody, type Unlock } from './schemas';
export async function snapshotDigest(attemptId: string, input: FinalBody) {
  const body = finalSchema.parse(input);
  const answers = [...body.answers]
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
    .map((a) => [a.itemId, a.value]);
  if (new Set(body.answers.map((a) => a.itemId)).size !== body.answers.length)
    throw new Error('Duplicate final item.');
  const canonical = JSON.stringify([
    'nexora-final-v1',
    attemptId,
    body.examVersion,
    body.scheduleRevision,
    body.deviceGeneration,
    body.finalSeq,
    answers,
  ]);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
function exactOrder(order: string[], ids: string[]) {
  return (
    order.length === ids.length &&
    new Set(order).size === ids.length &&
    ids.every((id) => order.includes(id))
  );
}
export async function decryptPaper(packet: EncryptedPackage, unlock: Unlock, attempt: Attempt) {
  if (
    unlock.packageId !== packet.packageId ||
    unlock.deviceGeneration !== attempt.deviceGeneration ||
    packet.examVersion !== attempt.examVersion ||
    packet.scheduleRevision !== attempt.scheduleRevision ||
    unlock.deadlineAt !== attempt.deadlineAt ||
    unlock.finalAcceptUntil !== attempt.finalAcceptUntil
  )
    throw new Error('Unlock does not match this attempt.');
  if (
    Date.parse(unlock.serverNow) < Date.parse(attempt.startsAt) ||
    Date.parse(unlock.serverNow) >= Date.parse(unlock.deadlineAt)
  )
    throw new Error('Unlock is outside the exam window.');
  await verifyPackage(packet);
  const key = await crypto.subtle.importKey('raw', decodeBase64url(unlock.key), 'AES-GCM', false, [
    'decrypt',
  ]);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64url(packet.iv), tagLength: 128 },
    key,
    decodeBase64url(packet.ciphertext),
  );
  const paper = paperSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)),
  );
  const ids = paper.items.map((item) => item.itemId);
  if (
    paper.examVersion !== packet.examVersion ||
    new Set(ids).size !== ids.length ||
    !exactOrder(unlock.questionOrder, ids) ||
    !exactOrder(Object.keys(unlock.optionOrders), ids)
  )
    throw new Error('Invalid question order.');
  for (const item of paper.items) {
    const options = item.options.map((option) => option.id);
    if (
      new Set(options).size !== options.length ||
      !exactOrder(unlock.optionOrders[item.itemId] ?? [], options) ||
      (item.type === 'true_false' && !exactOrder(options, ['true', 'false']))
    )
      throw new Error('Invalid option order.');
  }
  // Sort only after exact membership checks; key and raw plaintext are never persisted.
  paper.items.sort(
    (a, b) => unlock.questionOrder.indexOf(a.itemId) - unlock.questionOrder.indexOf(b.itemId),
  );
  for (const item of paper.items)
    item.options.sort(
      (a, b) =>
        (unlock.optionOrders[item.itemId]?.indexOf(a.id) ?? 0) -
        (unlock.optionOrders[item.itemId]?.indexOf(b.id) ?? 0),
    );
  return paper;
}
