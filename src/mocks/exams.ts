import { z } from 'zod';
import type { Attempt, EncryptedPackage, Exam } from '@/features/exams/schemas';
import { answerSchema, finalSchema, type Paper, type FinalBody } from '@/features/runner/schemas';
import { snapshotDigest } from '@/features/runner/crypto';
import type { DemoSitting } from './authoring-store';
// Synthetic schedules are relative to launch. This simulator is development-only.
export function createExamDemo(
  clock = () => Date.now(),
  scheduled: () => DemoSitting[] = () => [],
  record: (
    attempt: Attempt,
    answers?: { itemId: string; value: string | null }[],
  ) => void = () => {},
  recordRecovery: (
    attempt: Attempt,
    body: FinalBody,
    reason: string,
    key: string,
    digest: string,
    paper: Paper,
  ) => void = () => {},
) {
  const launch = clock();
  const starts = [-7_200_000, -7_200_000, -7_200_000, -120_000, 30_000, 86_400_000];
  const titles = [
    'Chemistry · completed',
    'Biology · school review',
    'History · ended',
    'English · current window',
    'Mathematics · preparation',
    'Physics · tomorrow',
  ];
  const attempts = new Map<string, Attempt>();
  const bindings = new Map<string, string>();
  const enrolled = new Set<string>();
  const packets = new Map<string, EncryptedPackage>();
  const keys = new Map<string, string>();
  const orders = new Map<
    string,
    { questionOrder: string[]; optionOrders: Record<string, string[]> }
  >();
  const revisions = new Map<string, Map<number, string>>();
  const finalRequests = new Map<string, { key: string; digest: string }>();
  const recoveryRequests = new Map<
    string,
    { key: string; body: string; recoveryId: string; receivedAt: string }
  >();
  const paper: Paper = {
    examVersion: 1,
    title: 'Nexora demo · objective paper',
    instructions: 'Choose one answer for each question. Unanswered items may be submitted.',
    items: [
      {
        itemId: 'q1',
        type: 'true_false',
        stem: 'A triangle has three sides.',
        marks: 2,
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        itemId: `q${index + 2}`,
        type: 'mcq_single' as const,
        stem: `What is ${index + 2} + ${index + 3}?`,
        marks: 2,
        options: [
          { id: 'a', text: String(index * 2 + 4) },
          { id: 'b', text: String(index * 2 + 5) },
          { id: 'c', text: String(index * 2 + 6) },
        ],
      })),
    ],
  };
  const encode = (bytes: Uint8Array) =>
    btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const iso = (value: number) => new Date(value).toISOString();
  const now = () => iso(clock());
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const error = (code: string, message: string, status = 409) =>
    json({ code, message, details: [], requestId: 'demo-exam' }, status);
  function exams(): Exam[] {
    const seeded: Exam[] = starts.map((offset, index) => {
      const start = launch + offset;
      const durationMinutes = index === 3 ? 5 : index === 4 ? 2 : 60;
      const end = start + durationMinutes * 60_000;
      const sessionId = `demo-session-${index}`;
      const attempt = attempts.get(sessionId);
      return {
        examId: `demo-exam-${index}`,
        sessionId,
        title: titles[index] ?? 'Demo paper',
        subjectName: (titles[index] ?? 'Demo').split(' · ')[0] ?? 'Demo',
        className: 'Grade 10 A',
        durationMinutes,
        preparationVisibleAt: iso(start - 600_000),
        startsAt: iso(start),
        endsAt: iso(end),
        deadlineAt: iso(end),
        scheduleRevision: 1,
        phase:
          clock() < start - 600_000
            ? 'scheduled'
            : clock() < start
              ? 'preparing'
              : clock() < end
                ? 'open'
                : 'ended',
        attemptId: attempt?.attemptId ?? (index < 2 ? `demo-attempt-${index}` : null),
        attemptState:
          attempt?.state ?? (index === 0 ? 'submitted' : index === 1 ? 'recovery_pending' : null),
      };
    });
    return [
      ...seeded,
      ...scheduled().map(({ session: s, title, durationMinutes }): Exam => {
        const attempt = attempts.get(s.sessionId);
        return {
          examId: s.examId,
          sessionId: s.sessionId,
          title,
          durationMinutes,
          subjectName: 'Mathematics',
          className: 'Grade 10 A',
          preparationVisibleAt: s.preparationVisibleAt,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          deadlineAt: s.endsAt,
          scheduleRevision: s.scheduleRevision,
          phase:
            clock() < Date.parse(s.preparationVisibleAt)
              ? 'scheduled'
              : clock() < Date.parse(s.startsAt)
                ? 'preparing'
                : clock() < Date.parse(s.endsAt)
                  ? 'open'
                  : 'ended',
          attemptId: attempt?.attemptId ?? null,
          attemptState: attempt?.state ?? null,
        };
      }),
    ].sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.sessionId.localeCompare(b.sessionId),
    );
  }
  function paperFor(attempt: Attempt) {
    return scheduled().find((s) => s.session.sessionId === attempt.sessionId)?.paper ?? paper;
  }
  function ordered(ids: string[], shuffle: boolean) {
    const values = [...ids];
    if (shuffle)
      for (let i = values.length - 1; i > 0; i--) {
        const j = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % (i + 1);
        const a = values[i];
        const b = values[j];
        if (a !== undefined && b !== undefined) {
          values[i] = b;
          values[j] = a;
        }
      }
    return values;
  }
  async function packet(attempt: Attempt) {
    const existing = packets.get(attempt.attemptId);
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(paperFor(attempt)));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
    );
    keys.set(attempt.attemptId, encode(new Uint8Array(await crypto.subtle.exportKey('raw', key))));
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const value: EncryptedPackage = {
      packageId: crypto.randomUUID(),
      examVersion: attempt.examVersion,
      scheduleRevision: attempt.scheduleRevision,
      algorithm: 'AES-GCM',
      iv: encode(iv),
      ciphertext: encode(ciphertext),
      sha256,
    };
    packets.set(attempt.attemptId, value);
    return value;
  }
  return async (path: string, method: string, body: unknown, headers: Headers) => {
    if (path === '/auth/device' && method === 'POST') {
      const parsed = z.object({ deviceId: z.uuid() }).safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid device ID.', 422);
      enrolled.add(parsed.data.deviceId);
      return json(parsed.data);
    }
    if (path === '/me/exams' && method === 'GET')
      return json({ items: exams(), nextCursor: null, serverNow: now() });
    if (path.startsWith('/me/exams/') && method === 'GET') {
      const exam = exams().find(
        (item) => item.sessionId === decodeURIComponent(path.slice('/me/exams/'.length)),
      );
      return exam
        ? json({ exam, serverNow: now() })
        : error('NOT_FOUND', 'This exam is unavailable.', 404);
    }
    const creation = /^\/sessions\/([^/]+)\/attempts$/.exec(path);
    if (creation && method === 'POST') {
      const exam = exams().find((item) => item.sessionId === creation[1]);
      if (!exam) return error('NOT_FOUND', 'This exam is unavailable.', 404);
      const parsed = z.object({ deviceId: z.uuid() }).safeParse(body);
      if (!parsed.success || !enrolled.has(parsed.data.deviceId))
        return error('DEVICE_REPLACED', 'Enroll this browser first.');
      if (!z.uuid().safeParse(headers.get('Idempotency-Key')).success)
        return error('VALIDATION_ERROR', 'Idempotency key is required.', 422);
      const existing = attempts.get(exam.sessionId);
      if (existing)
        return bindings.get(existing.attemptId) === parsed.data.deviceId
          ? json({ ...existing, serverNow: now() })
          : error('DEVICE_REPLACED', 'Another browser is bound to this attempt.');
      if (exam.phase === 'scheduled') return error('NOT_PREPARING', 'Preparation has not opened.');
      if (exam.phase === 'ended') return error('RECOVERY_REQUIRED', 'The exam window ended.');
      const attempt: Attempt = {
        attemptId: crypto.randomUUID(),
        sessionId: exam.sessionId,
        examVersion:
          scheduled().find((s) => s.session.sessionId === exam.sessionId)?.session
            .approvedVersion ?? 1,
        scheduleRevision: exam.scheduleRevision,
        deviceGeneration: 1,
        state: 'preparing',
        serverNow: now(),
        startsAt: exam.startsAt,
        deadlineAt: exam.deadlineAt,
        finalAcceptUntil: iso(Date.parse(exam.deadlineAt) + 5000),
        lastServerSaveAt: null,
        highestAcceptedSeq: 0,
        answers: [],
        receipt: null,
        recovery: null,
      };
      attempts.set(exam.sessionId, attempt);
      record(attempt);
      bindings.set(attempt.attemptId, parsed.data.deviceId);
      return json(attempt, 201);
    }
    const write = /^\/attempts\/([^/]+)\/(unlock|answers|submit|recovery)$/.exec(path);
    if (write && method === 'POST') {
      const attempt = [...attempts.values()].find((item) => item.attemptId === write[1]);
      if (!attempt) return error('NOT_FOUND', 'Attempt unavailable.', 404);
      const paper = paperFor(attempt);
      const action = write[2];
      const finalized = finalRequests.get(attempt.attemptId);
      if (action === 'unlock') {
        if (!['preparing', 'active'].includes(attempt.state))
          return error('ALREADY_FINALIZED', 'This attempt is closed.');
        if (clock() < Date.parse(attempt.startsAt))
          return error('NOT_STARTED', 'The exam has not started.');
        if (clock() >= Date.parse(attempt.deadlineAt))
          return error('RECOVERY_REQUIRED', 'The deadline has passed.');
        const packetValue = await packet(attempt);
        const input = z
          .object({
            packageId: z.string(),
            examVersion: z.number(),
            scheduleRevision: z.number(),
            deviceGeneration: z.number(),
          })
          .safeParse(body);
        if (
          !input.success ||
          input.data.packageId !== packetValue.packageId ||
          input.data.examVersion !== attempt.examVersion ||
          input.data.scheduleRevision !== attempt.scheduleRevision ||
          input.data.deviceGeneration !== attempt.deviceGeneration
        )
          return error('REVISION_CONFLICT', 'Package identity mismatch.');
        attempt.state = 'active';
        let order = orders.get(attempt.attemptId);
        if (!order) {
          const shuffle =
            scheduled().find((s) => s.session.sessionId === attempt.sessionId)?.shuffle ?? false;
          order = {
            questionOrder: ordered(
              paper.items.map((i) => i.itemId),
              shuffle,
            ),
            optionOrders: Object.fromEntries(
              paper.items.map((i) => [
                i.itemId,
                ordered(
                  i.options.map((o) => o.id),
                  shuffle,
                ),
              ]),
            ),
          };
          orders.set(attempt.attemptId, order);
        }
        return json({
          packageId: packetValue.packageId,
          key: keys.get(attempt.attemptId),
          serverNow: now(),
          deadlineAt: attempt.deadlineAt,
          finalAcceptUntil: attempt.finalAcceptUntil,
          deviceGeneration: attempt.deviceGeneration,
          ...order,
        });
      }
      if (action === 'answers') {
        if (attempt.state !== 'active')
          return error('ALREADY_FINALIZED', 'This attempt is not editable.');
        if (clock() >= Date.parse(attempt.deadlineAt))
          return error('RECOVERY_REQUIRED', 'The deadline has passed.');
        const parsed = finalSchema
          .omit({ finalSeq: true, answers: true })
          .extend({ answers: z.array(answerSchema) })
          .safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid answer batch.', 422);
        if (
          parsed.data.deviceGeneration !== attempt.deviceGeneration ||
          parsed.data.examVersion !== attempt.examVersion ||
          parsed.data.scheduleRevision !== attempt.scheduleRevision
        )
          return error('REVISION_CONFLICT', 'Version mismatch.');
        const seen = revisions.get(attempt.attemptId) ?? new Map<number, string>();
        const pending = new Map(seen);
        for (const answer of parsed.data.answers) {
          const item = paper.items.find((item) => item.itemId === answer.itemId);
          if (
            !item ||
            (answer.value !== null && !item.options.some((option) => option.id === answer.value)) ||
            answer.clientSeq < 1
          )
            return error('VALIDATION_ERROR', 'Invalid answer.', 422);
          const fingerprint = JSON.stringify([answer.itemId, answer.value]);
          if (pending.has(answer.clientSeq) && pending.get(answer.clientSeq) !== fingerprint)
            return error('REVISION_CONFLICT', 'Sequence already used.');
          pending.set(answer.clientSeq, fingerprint);
        }
        if (new Set(parsed.data.answers.map((a) => a.itemId)).size !== parsed.data.answers.length)
          return error('VALIDATION_ERROR', 'Duplicate item.', 422);
        const acknowledged: { itemId: string; clientSeq: number }[] = [];
        const superseded: { itemId: string; clientSeq: number; currentSeq: number }[] = [];
        for (const answer of parsed.data.answers) {
          const current = attempt.answers.find((a) => a.itemId === answer.itemId);
          if (current && current.clientSeq > answer.clientSeq)
            superseded.push({
              itemId: answer.itemId,
              clientSeq: answer.clientSeq,
              currentSeq: current.clientSeq,
            });
          else {
            attempt.answers = [
              ...attempt.answers.filter((a) => a.itemId !== answer.itemId),
              answer,
            ];
            acknowledged.push({ itemId: answer.itemId, clientSeq: answer.clientSeq });
          }
          attempt.highestAcceptedSeq = Math.max(attempt.highestAcceptedSeq, answer.clientSeq);
        }
        revisions.set(attempt.attemptId, pending);
        attempt.lastServerSaveAt = now();
        return json({
          acknowledged,
          superseded,
          highestAcceptedSeq: attempt.highestAcceptedSeq,
          lastServerSaveAt: attempt.lastServerSaveAt,
          serverNow: now(),
        });
      }
      const parsed = (
        action === 'recovery'
          ? finalSchema.extend({ reason: z.string().trim().min(1) })
          : finalSchema
      ).safeParse(body);
      const idempotencyKey = headers.get('Idempotency-Key');
      if (!parsed.success || !idempotencyKey || !z.uuid().safeParse(idempotencyKey).success)
        return error('VALIDATION_ERROR', 'Invalid final request.', 422);
      const final = finalSchema.parse(parsed.data);
      if (
        final.answers.length !== paper.items.length ||
        new Set(final.answers.map((a) => a.itemId)).size !== paper.items.length ||
        final.answers.some((a) => {
          const item = paper.items.find((item) => item.itemId === a.itemId);
          return (
            !item || (a.value !== null && !item.options.some((option) => option.id === a.value))
          );
        })
      )
        return error(
          'VALIDATION_ERROR',
          'Final snapshot must contain every item exactly once.',
          422,
        );
      const digest = await snapshotDigest(attempt.attemptId, final);
      if (finalized)
        return finalized.key === idempotencyKey && finalized.digest === digest
          ? json(attempt.receipt)
          : error('ALREADY_FINALIZED', 'Another final submission exists.');
      if (attempt.receipt)
        return error('ALREADY_FINALIZED', 'An accepted submission exists. Check its receipt.');
      if (
        final.examVersion !== attempt.examVersion ||
        final.scheduleRevision !== attempt.scheduleRevision ||
        final.deviceGeneration !== attempt.deviceGeneration
      )
        return error('REVISION_CONFLICT', 'Version mismatch.');
      if (action === 'recovery') {
        const recoveryKey = `${attempt.attemptId}:${idempotencyKey}`;
        const old = recoveryRequests.get(recoveryKey);
        if (old)
          return old.key === idempotencyKey && old.body === JSON.stringify(parsed.data)
            ? json({
                status: 'recovery_pending',
                recoveryId: old.recoveryId,
                receivedAt: old.receivedAt,
              })
            : error(
                'REVISION_CONFLICT',
                'A different recovery upload already exists in this demo.',
              );
        if (clock() <= Date.parse(attempt.finalAcceptUntil))
          return error(
            'REVISION_CONFLICT',
            'Keep the final snapshot and retry normal submission until the submission window closes.',
          );
        const recovery = {
          key: idempotencyKey,
          body: JSON.stringify(parsed.data),
          recoveryId: crypto.randomUUID(),
          receivedAt: now(),
        };
        recoveryRequests.set(recoveryKey, recovery);
        attempt.state = 'recovery_pending';
        attempt.recovery = {
          recoveryId: recovery.recoveryId,
          status: 'recovery_pending',
          receivedAt: recovery.receivedAt,
        };
        const reason = z.object({ reason: z.string() }).parse(parsed.data).reason;
        recordRecovery(attempt, final, reason, idempotencyKey, digest, paper);
        return json(
          {
            status: 'recovery_pending',
            recoveryId: recovery.recoveryId,
            receivedAt: recovery.receivedAt,
          },
          201,
        );
      }
      if (attempt.state === 'recovery_pending')
        return error('RECOVERY_REQUIRED', 'School review is pending.');
      if (clock() > Date.parse(attempt.finalAcceptUntil)) {
        attempt.state = 'awaiting_upload';
        return error(
          'RECOVERY_REQUIRED',
          'The submission window closed. Send retained answers for school review.',
        );
      }
      if (attempt.state !== 'active' || clock() < Date.parse(attempt.startsAt))
        return error('NOT_STARTED', 'Unlock this attempt first.');
      if (final.finalSeq < attempt.highestAcceptedSeq)
        return error('REVISION_CONFLICT', 'Final sequence is behind server saves.');
      attempt.receipt = {
        status: 'submitted',
        receiptId: crypto.randomUUID(),
        acceptedAt: now(),
        snapshotDigest: digest,
        idempotencyKey,
        finalSeq: final.finalSeq,
      };
      attempt.state = 'submitted';
      record(attempt, final.answers);
      finalRequests.set(attempt.attemptId, { key: idempotencyKey, digest });
      return json(attempt.receipt);
    }
    const read = /^\/attempts\/([^/]+)(\/package|\/receipt)?$/.exec(path);
    if (read && method === 'GET') {
      const attempt = [...attempts.values()].find((item) => item.attemptId === read[1]);
      if (!attempt) return error('NOT_FOUND', 'Attempt unavailable.', 404);
      if (read[2] === '/receipt')
        return json({
          attemptId: attempt.attemptId,
          state: attempt.state,
          receipt: attempt.receipt,
          recovery: attempt.recovery,
        });
      if (read[2] === '/package') {
        if (clock() >= Date.parse(attempt.deadlineAt))
          return error('RECOVERY_REQUIRED', 'The exam window ended.');
        return json(await packet(attempt));
      }
      return json({ ...attempt, serverNow: now() });
    }
    return error('NOT_FOUND', 'This endpoint is not implemented in the demo.', 404);
  };
}
