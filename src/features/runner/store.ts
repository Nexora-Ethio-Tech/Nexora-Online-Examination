import { openDB, type DBSchema } from 'idb';
import type { Attempt } from '@/features/exams/schemas';
import type { Answer, FinalBody, Paper, Receipt, SaveResponse } from './schemas';
export type Owner = { schoolId: string; userId: string };
export type RecordData = {
  key: string;
  owner: Owner;
  attempt: Attempt;
  items: { itemId: string; options: string[] }[];
  reviewItemIds?: string[];
  answers: Answer[];
  seq: number;
  outbox: Answer[];
  final: { body: FinalBody; key: string } | null;
  receipt: Receipt | null;
  recovery: { key: string; reason: string; receivedAt: string | null } | null;
};
interface RunnerDB extends DBSchema {
  attempts: { key: string; value: RecordData };
}
const database = () =>
  openDB<RunnerDB>('nexora-runner-v1', 1, {
    upgrade(db) {
      db.createObjectStore('attempts');
    },
  });
export const recordKey = (owner: Owner, attempt: Attempt) =>
  JSON.stringify([
    owner.schoolId,
    owner.userId,
    attempt.attemptId,
    attempt.examVersion,
    attempt.scheduleRevision,
    attempt.deviceGeneration,
  ]);
export async function recordsFor(owner: Owner, attemptId: string) {
  const db = await database();
  try {
    return (await db.getAll('attempts')).filter(
      (row) =>
        row.owner.schoolId === owner.schoolId &&
        row.owner.userId === owner.userId &&
        row.attempt.attemptId === attemptId,
    );
  } finally {
    db.close();
  }
}
export async function readRecord(key: string) {
  const db = await database();
  try {
    return await db.get('attempts', key);
  } finally {
    db.close();
  }
}
async function update(key: string, change: (row: RecordData) => void) {
  const db = await database();
  try {
    const tx = db.transaction('attempts', 'readwrite');
    void tx.done.catch(() => undefined);
    const row = await tx.store.get(key);
    if (!row) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new Error('Local attempt is missing.');
    }
    try {
      change(row);
    } catch (error) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw error;
    }
    await tx.store.put(row, key);
    await tx.done;
    return row;
  } finally {
    db.close();
  }
}
export async function initialize(owner: Owner, attempt: Attempt, paper: Paper) {
  const db = await database();
  const key = recordKey(owner, attempt);
  try {
    const tx = db.transaction('attempts', 'readwrite');
    void tx.done.catch(() => undefined);
    const existing = await tx.store.get(key);
    if (existing) {
      await tx.done;
      return existing;
    }
    const row: RecordData = {
      key,
      owner,
      attempt,
      items: paper.items.map((item) => ({
        itemId: item.itemId,
        options: item.options.map((option) => option.id),
      })),
      answers: [],
      seq: 0,
      outbox: [],
      final: null,
      receipt: null,
      recovery: null,
    };
    await tx.store.put(row, key);
    await tx.done;
    return row;
  } finally {
    db.close();
  }
}
export function saveAnswer(key: string, itemId: string, value: string | null, now: number) {
  return update(key, (row) => {
    if (row.final || row.receipt || now >= Date.parse(row.attempt.deadlineAt))
      throw new Error('Answer editing has closed.');
    const item = row.items.find((item) => item.itemId === itemId);
    if (!item || (value !== null && !item.options.includes(value)))
      throw new Error('Unknown answer.');
    if (row.seq >= Number.MAX_SAFE_INTEGER) throw new Error('Revision limit reached.');
    const answer = { itemId, value, clientSeq: ++row.seq };
    row.answers = [...row.answers.filter((a) => a.itemId !== itemId), answer];
    row.outbox = [...row.outbox.filter((a) => a.itemId !== itemId), answer];
  });
}
export function reconcile(key: string, attempt: Attempt) {
  return update(key, (row) => {
    if (recordKey(row.owner, attempt) !== key)
      throw new Error('Device or paper version changed. Local work is retained.');
    if (row.final) return;
    for (const remote of attempt.answers) {
      const item = row.items.find((item) => item.itemId === remote.itemId);
      if (!item || (remote.value !== null && !item.options.includes(remote.value)))
        throw new Error('Invalid server answer.');
      const local = row.answers.find((a) => a.itemId === remote.itemId);
      if (local && remote.clientSeq === local.clientSeq && remote.value !== local.value)
        throw new Error('Answer revision conflict. Local evidence is retained.');
      if (!local || remote.clientSeq > local.clientSeq) {
        // An unacknowledged older local value is disputed evidence, not safe to discard.
        if (row.outbox.some((a) => a.itemId === remote.itemId && a.value !== remote.value))
          throw new Error('Server and device answers conflict. Contact your school.');
        row.answers = [...row.answers.filter((a) => a.itemId !== remote.itemId), remote];
      }
      row.outbox = row.outbox.filter(
        (a) =>
          !(
            a.itemId === remote.itemId &&
            a.clientSeq <= remote.clientSeq &&
            a.value === remote.value
          ),
      );
    }
    row.seq = Math.max(
      row.seq,
      attempt.highestAcceptedSeq,
      ...attempt.answers.map((a) => a.clientSeq),
    );
    row.attempt = attempt;
  });
}
export function acknowledge(key: string, sent: Answer[], response: SaveResponse) {
  return update(key, (row) => {
    for (const ack of response.acknowledged) {
      if (!sent.some((a) => a.itemId === ack.itemId && a.clientSeq === ack.clientSeq))
        throw new Error('Unexpected save acknowledgement.');
      row.outbox = row.outbox.filter(
        (a) => !(a.itemId === ack.itemId && a.clientSeq === ack.clientSeq),
      );
    }
    // Superseded revisions remain until explicit reconciliation establishes their value.
    row.attempt.lastServerSaveAt = response.lastServerSaveAt;
    row.seq = Math.max(row.seq, response.highestAcceptedSeq);
  });
}
export function freeze(key: string) {
  return update(key, (row) => {
    if (row.final) return;
    row.final = {
      key: crypto.randomUUID(),
      body: {
        examVersion: row.attempt.examVersion,
        scheduleRevision: row.attempt.scheduleRevision,
        deviceGeneration: row.attempt.deviceGeneration,
        finalSeq: row.seq,
        answers: row.items.map((item) => ({
          itemId: item.itemId,
          value: row.answers.find((a) => a.itemId === item.itemId)?.value ?? null,
        })),
      },
    };
  });
}
export function recordReceipt(key: string, receipt: Receipt) {
  return update(key, (row) => {
    row.receipt = receipt;
  });
}
export function retainRecovery(key: string, reason: string) {
  return update(key, (row) => {
    if (!row.final) throw new Error('Freeze answers first.');
    row.recovery ??= { key: crypto.randomUUID(), reason, receivedAt: null };
  });
}
export function recordRecovery(key: string, receivedAt: string) {
  return update(key, (row) => {
    if (!row.recovery) throw new Error('Recovery request missing.');
    row.recovery.receivedAt = receivedAt;
  });
}

// Personal reminders stay in this identity-bound record, never in an answer payload.
export async function setReviewFlag(key: string, itemId: string, marked: boolean, now: number) {
  return update(key, (row) => {
    if (row.final || row.receipt || now >= Date.parse(row.attempt.deadlineAt))
      throw new Error('This attempt is no longer editable.');
    if (!row.items.some((item) => item.itemId === itemId)) throw new Error('Unknown question.');
    const flags = new Set(row.reviewItemIds ?? []);
    if (marked) flags.add(itemId);
    else flags.delete(itemId);
    row.reviewItemIds = [...flags];
    return row;
  });
}
