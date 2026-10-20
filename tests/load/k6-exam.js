import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import execution from 'k6/execution';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

const base = __ENV.TARGET_URL;
if (!base || __ENV.CONFIRM_TEST_TARGET !== base)
  throw new Error('Set TARGET_URL and the identical CONFIRM_TEST_TARGET for isolated staging');
if (!__ENV.FIXTURE_FILE) throw new Error('FIXTURE_FILE is required');
const fixture = JSON.parse(open(__ENV.FIXTURE_FILE));
const students = new SharedArray('synthetic students', () => fixture.students);
const count = Number(__ENV.STUDENTS || '500');
if (!Number.isInteger(count) || count < 1 || count > 500 || students.length < count)
  throw new Error('Provide 1–500 distinct synthetic student accounts');
if (new Set(students.map((student) => student.loginId)).size !== students.length)
  throw new Error('Each virtual user must have a distinct real test account');
if (
  !fixture.sessionId ||
  !fixture.origin ||
  !fixture.preparationVisibleAt ||
  !fixture.answers?.length
)
  throw new Error('Fixture requires sessionId, origin, preparationVisibleAt and complete answers');

const saves = new Trend('save_latency_ms');
const receipts = new Trend('receipt_latency_ms');
const committed = new Counter('confirmed_receipts');
const replayed = new Counter('matching_replays');
export const options = {
  scenarios: {
    sitting: {
      executor: 'per-vu-iterations',
      vus: count,
      iterations: 1,
      maxDuration: __ENV.MAX_DURATION || '2h',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    save_latency_ms: ['p(95)<2000'],
    receipt_latency_ms: ['p(95)<3000'],
    confirmed_receipts: [`count==${count}`],
    matching_replays: [`count==${count}`],
  },
};

function uuid() {
  const bytes = new Uint8Array(crypto.randomBytes(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function until(time) {
  const seconds = (time - Date.now()) / 1000;
  if (seconds > 0) sleep(seconds);
}
function requireCheck(condition, label) {
  if (!check(condition, { [label]: (value) => value })) fail(label);
}

export default function () {
  const index = execution.vu.idInTest - 1;
  const student = students[index];
  // Spread real logins/preloads through the ten-minute preparation window.
  until(Date.parse(fixture.preparationVisibleAt) + (index / count) * 570000);
  let csrf;
  function call(method, path, body, key, statuses = [200]) {
    const response = http.request(method, `${base}${path}`, body ? JSON.stringify(body) : null, {
      headers: {
        Origin: fixture.origin,
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      tags: { name: path.replace(/[0-9a-f-]{36}/g, ':id') },
      redirects: 0,
    });
    requireCheck(statuses.includes(response.status), `${method} ${path.split('/')[1]} succeeds`);
    return { body: response.json(), duration: response.timings.duration };
  }
  csrf = call('GET', '/auth/csrf').body.csrfToken;
  call('POST', '/auth/login', { loginId: student.loginId, password: student.password });
  const identity = call('GET', '/auth/me').body;
  requireCheck(identity.user.role === 'student', 'authenticated student');
  csrf = identity.csrfToken;
  const deviceId = uuid();
  call('POST', '/auth/device', { deviceId });
  const attempt = call(
    'POST',
    `/sessions/${fixture.sessionId}/attempts`,
    { deviceId },
    uuid(),
    [200, 201],
  ).body;
  const path = `/attempts/${attempt.attemptId}`;
  const packet = call('GET', `${path}/package`).body;
  requireCheck(
    crypto.sha256(encoding.b64decode(packet.ciphertext, 'rawurl'), 'hex') === packet.sha256,
    'downloaded package checksum matches',
  );
  const offset = Date.parse(attempt.serverNow) - Date.now();
  requireCheck(
    Date.now() + offset < Date.parse(attempt.startsAt),
    'preload finished before common start',
  );
  until(Date.parse(attempt.startsAt) - offset);
  const version = {
    examVersion: attempt.examVersion,
    scheduleRevision: attempt.scheduleRevision,
    deviceGeneration: attempt.deviceGeneration,
  };
  const unlocked = call('POST', `${path}/unlock`, {
    ...version,
    packageId: packet.packageId,
  }).body;
  requireCheck(
    [...unlocked.questionOrder].sort().join('|') ===
      fixture.answers
        .map((answer) => answer.itemId)
        .sort()
        .join('|'),
    'fixture covers every official question',
  );
  let seq = 0;
  sleep(Math.random() * 5);
  const deadline = Date.parse(unlocked.deadlineAt) - offset;
  while (Date.now() < deadline - 30000) {
    const answers = fixture.answers.map((answer) => ({ ...answer, clientSeq: ++seq }));
    const result = call('POST', `${path}/answers`, { ...version, answers });
    saves.add(result.duration);
    requireCheck(
      answers.every((answer) =>
        result.body.acknowledged.some(
          (ack) => ack.itemId === answer.itemId && ack.clientSeq === answer.clientSeq,
        ),
      ),
      'every answer revision acknowledged',
    );
    sleep(30);
  }
  requireCheck(seq > 0, 'sitting included connected answer saves');
  // Reproduce the five-second final wave, with time left for an identical retry.
  until(deadline + Math.random() * 2000);
  const final = { ...version, finalSeq: seq, answers: fixture.answers };
  const key = uuid();
  const result = call('POST', `${path}/submit`, final, key);
  receipts.add(result.duration);
  const tuple = [
    'nexora-final-v1',
    attempt.attemptId,
    version.examVersion,
    version.scheduleRevision,
    version.deviceGeneration,
    seq,
    [...fixture.answers]
      .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
      .map((answer) => [answer.itemId, answer.value]),
  ];
  const digest = crypto.sha256(JSON.stringify(tuple), 'hex');
  requireCheck(
    result.body.status === 'submitted' &&
      result.body.receiptId &&
      result.body.snapshotDigest === digest,
    'receipt confirms exact frozen snapshot',
  );
  committed.add(1);
  const replay = call('POST', `${path}/submit`, final, key).body;
  requireCheck(
    replay.receiptId === result.body.receiptId && replay.snapshotDigest === digest,
    'duplicate submit returns the same receipt',
  );
  const stored = call('GET', `${path}/receipt`).body;
  requireCheck(stored.receipt?.receiptId === replay.receiptId, 'receipt survives a separate read');
  replayed.add(1);
}
