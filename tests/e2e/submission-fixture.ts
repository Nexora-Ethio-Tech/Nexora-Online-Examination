import { createHash } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import fixture from '../../nexora-backend/docs/Nexora_Backend_BE10_v0.11/docs/fixtures/student-exam-v1.json' with { type: 'json' };
import type { Attempt } from '../../src/features/exams/schemas';
import { finalSchema } from '../../src/features/runner/schemas';

// A network-level simulator for the production browser, not a real backend.
export async function submissionFixture(context: BrowserContext) {
  const now = Date.now();
  const time = (offset = 0) => new Date(now + offset).toISOString();
  const attempt: Attempt = {
    attemptId: fixture.attemptId,
    sessionId: 'synthetic-sitting',
    examVersion: 1,
    scheduleRevision: 1,
    deviceGeneration: 1,
    state: 'active',
    serverNow: time(),
    startsAt: time(-60000),
    deadlineAt: time(600000),
    finalAcceptUntil: time(605000),
    lastServerSaveAt: null,
    highestAcceptedSeq: 0,
    answers: [],
    receipt: null,
    recovery: null,
  };
  let loseResponse = true;
  const sent: { key: string | undefined; body: string | null }[] = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          user: {
            id: 'synthetic-student',
            loginId: 'SYNTHETIC',
            displayName: 'Synthetic student',
            role: 'student',
          },
          school: {
            id: 'synthetic-school',
            name: 'Synthetic school',
            timezone: 'Africa/Addis_Ababa',
          },
          csrfToken: 'synthetic-csrf',
          serverNow: time(),
        },
      });
    if (path.endsWith('/auth/device')) return route.fulfill({ json: request.postDataJSON() });
    if (path.endsWith('/attempts') || path.endsWith(`/${fixture.attemptId}`))
      return route.fulfill({ json: attempt });
    if (path.endsWith('/package')) return route.fulfill({ json: fixture.package });
    if (path.endsWith('/unlock'))
      return route.fulfill({
        json: {
          packageId: fixture.package.packageId,
          key: fixture.unlockKey,
          serverNow: time(),
          deadlineAt: attempt.deadlineAt,
          finalAcceptUntil: attempt.finalAcceptUntil,
          deviceGeneration: 1,
          questionOrder: fixture.questionOrder,
          optionOrders: fixture.optionOrders,
        },
      });
    if (path.endsWith('/submit')) {
      const body = finalSchema.parse(request.postDataJSON());
      const key = request.headers()['idempotency-key'];
      sent.push({ key, body: request.postData() });
      const canonical = JSON.stringify([
        'nexora-final-v1',
        attempt.attemptId,
        body.examVersion,
        body.scheduleRevision,
        body.deviceGeneration,
        body.finalSeq,
        [...body.answers]
          .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
          .map((a) => [a.itemId, a.value]),
      ]);
      attempt.receipt = {
        status: 'submitted',
        receiptId: 'synthetic-receipt',
        acceptedAt: time(),
        snapshotDigest: createHash('sha256').update(canonical).digest('hex'),
        idempotencyKey: key ?? '',
        finalSeq: body.finalSeq,
      };
      attempt.state = 'submitted';
      if (loseResponse) return route.abort('connectionfailed');
      return route.fulfill({ json: attempt.receipt });
    }
    if (path.endsWith('/receipt')) {
      if (loseResponse) return route.abort('connectionfailed');
      return route.fulfill({
        json: {
          attemptId: attempt.attemptId,
          state: attempt.state,
          receipt: attempt.receipt,
          recovery: null,
        },
      });
    }
    // Interim network writes are deliberately unavailable; the final must include local work.
    if (path.endsWith('/answers')) return route.abort('connectionfailed');
    return route.fulfill({
      status: 500,
      json: {
        code: 'UNEXPECTED_REQUEST',
        message: `Unexpected synthetic path ${path}`,
        details: [],
        requestId: 'fixture',
      },
    });
  });
  return {
    attemptId: attempt.attemptId,
    sent,
    restore: () => {
      loseResponse = false;
    },
  };
}
