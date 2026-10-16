import * as crypto from 'crypto';

/**
 * Deterministically serializes any JavaScript value into canonical JSON.
 * - Object keys are sorted lexicographically.
 * - No whitespace between tokens.
 * - Undefined object values are omitted (matching JSON.stringify).
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const elements = val.map((item) => canonicalJsonStringify(item));
    return `[${elements.join(',')}]`;
  }

  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries: string[] = [];

  for (const key of sortedKeys) {
    const v = obj[key];
    if (v !== undefined) {
      entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(v)}`);
    }
  }

  return `{${entries.join(',')}}`;
}

/**
 * Computes lowercase hex SHA-256 digest of canonical JSON serialization.
 */
export function computeCanonicalDigest(val: unknown): string {
  const canonical = canonicalJsonStringify(val);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').toLowerCase();
}

/**
 * Builds the official canonical final submission JSON tuple according to BE-02 / v0.3:
 * [
 *   "nexora-final-v1",
 *   attemptId,
 *   examVersion,
 *   scheduleRevision,
 *   deviceGeneration,
 *   finalSeq,
 *   [[itemId, valueOrNull], ...]
 * ]
 * where answer pairs are sorted by itemId in ascending ASCII byte order.
 */
export function buildCanonicalFinalPayload(params: {
  attemptId: string;
  examVersion: number;
  scheduleRevision: number;
  deviceGeneration: number;
  finalSeq: number;
  answers: Array<{ itemId: string; value: string | null }>;
}): string {
  const sortedAnswers = [...params.answers]
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
    .map((ans) => [ans.itemId, ans.value]);

  const tuple = [
    'nexora-final-v1',
    params.attemptId,
    params.examVersion,
    params.scheduleRevision,
    params.deviceGeneration,
    params.finalSeq,
    sortedAnswers,
  ];

  return JSON.stringify(tuple);
}

/**
 * Computes the exact snapshotDigest hex SHA-256 string for a final submission snapshot.
 */
export function computeFinalSnapshotDigest(params: {
  attemptId: string;
  examVersion: number;
  scheduleRevision: number;
  deviceGeneration: number;
  finalSeq: number;
  answers: Array<{ itemId: string; value: string | null }>;
}): { canonicalUtf8: string; snapshotDigest: string } {
  const canonicalUtf8 = buildCanonicalFinalPayload(params);
  const snapshotDigest = crypto
    .createHash('sha256')
    .update(canonicalUtf8, 'utf8')
    .digest('hex')
    .toLowerCase();
  return { canonicalUtf8, snapshotDigest };
}
