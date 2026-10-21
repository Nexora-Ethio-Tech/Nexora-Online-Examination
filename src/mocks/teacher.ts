import { generationInputSchema } from '@/features/exams/authoring/generation-schemas';
import { z } from 'zod';
import {
  metadataSchema,
  itemSchema,
  reviewProblems,
  type Draft,
  type Item,
  type Job,
} from '@/features/exams/authoring/schemas';
import templateHashes from './teacher-template-hashes.json';
import { createAuthoringStore } from './authoring-store';
import { math20Items } from './math20';

export function sampleItems(): Item[] {
  return [
    {
      itemId: 'demo-item-1',
      externalId: 'MATH-001',
      type: 'mcq_single',
      stem: 'Solve 2x + 3 = 11.',
      options: [
        { id: 'A', text: '2' },
        { id: 'B', text: '4' },
        { id: 'C', text: '5' },
        { id: 'D', text: '7' },
      ],
      correctOptionId: 'B',
      marks: 2,
      primaryTopic: 'Linear equations',
      secondaryTopics: ['Algebra'],
      explanation: 'Subtract 3 from both sides: 2x = 8. Divide by 2 to get x = 4, option B.',
      keyConsistent: true,
      reviewFlags: [],
      reviewed: false,
      reviewNote: '',
    },
    {
      itemId: 'demo-item-2',
      externalId: 'MATH-002',
      type: 'true_false',
      stem: 'A triangle has three sides.',
      options: [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ],
      correctOptionId: 'true',
      marks: 2,
      primaryTopic: 'Plane geometry',
      secondaryTopics: [],
      explanation: 'A triangle is a polygon with exactly three sides. The statement is true.',
      keyConsistent: true,
      reviewFlags: ['Check that this explanation matches the taught definition.'],
      reviewed: false,
      reviewNote: '',
    },
  ];
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string, code = 'REVISION_CONFLICT', status = 409) =>
  json({ code, message, details: [], requestId: 'demo-teacher' }, status);
const revisionSchema = z.object({ revision: z.number().int().positive() });
// A fixture simulator only: no general OOXML parser and no real provider call.
export function createTeacherDemo(clock: () => number = Date.now, store = createAuthoringStore()) {
  const { drafts, papers } = store;
  const jobs = new Map<string, Job>();
  const due = new Map<
    string,
    { at: number; items: Item[]; generated?: boolean; policyRevision?: number }
  >();
  const replays = new Map<string, { fingerprint: string; body: unknown; status: number }>();
  function updateCounts(d: Draft) {
    const p = papers.get(d.examId) ?? [];
    d.itemCount = p.length;
    d.totalMarks = p.reduce((n, i) => n + i.marks, 0);
    d.reviewedCount = p.filter((i) => i.reviewed).length;
  }
  function advance() {
    for (const [id, pending] of due) {
      if (clock() < pending.at) continue;
      const j = jobs.get(id);
      const d = j && drafts.get(j.examId);
      if (
        j &&
        d &&
        pending.generated &&
        (!store.directory.aiExamSettings.aiExamGenerationEnabled ||
          pending.policyRevision !== store.directory.aiExamSettings.revision)
      ) {
        j.state = 'failed';
        j.failure = 'AI generation disabled. Existing questions were preserved.';
      } else if (j && d) {
        j.state = 'ready';
        j.completedCount = pending.items.length;
        j.parsedCount = pending.items.length;
        papers.set(d.examId, pending.items);
        d.revision++;
        updateCounts(d);
      }
      due.delete(id);
    }
  }
  return async (
    path: string,
    method: string,
    body: unknown,
    headers: Headers,
    teacherId = 'demo-teacher',
    params = new URLSearchParams(),
  ): Promise<Response> => {
    advance();
    const own = (examId: string) => (store.draftOwners.get(examId) ?? 'demo-teacher') === teacherId;
    const assignments = [...store.directory.assignments.values()].filter(
      (a) =>
        a.teacherId === teacherId &&
        a.active &&
        store.directory.classes.get(a.classId)?.active &&
        store.directory.subjects.get(a.subjectId)?.active,
    );
    if (method === 'GET' && path === '/me/teaching-assignments')
      return json({
        items: assignments
          .slice(Number(params.get('cursor') ?? 0), Number(params.get('cursor') ?? 0) + 25)
          .map((a) => ({
            assignmentId: a.assignmentId,
            subjectName: store.directory.subjects.get(a.subjectId)?.name,
            className: store.directory.classes.get(a.classId)?.name,
          })),
        nextCursor:
          Number(params.get('cursor') ?? 0) + 25 < assignments.length
            ? String(Number(params.get('cursor') ?? 0) + 25)
            : null,
      });
    if (method === 'GET' && path === '/exams')
      return json({
        items: [...drafts.values()].filter((d) => own(d.examId)).reverse(),
        nextCursor: null,
      });
    let fingerprint = JSON.stringify(body);
    let uploaded: File | null = null;
    let input = body;
    if (body instanceof FormData) {
      const blob = body.get('file');
      if (!(blob instanceof File)) return fail('Choose a template.', 'VALIDATION_ERROR', 422);
      uploaded = blob;
      const bytes = await blob.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
      input = {
        examId: body.get('examId'),
        revision: Number(body.get('revision')),
        name: blob.name,
        hash,
      };
      fingerprint = JSON.stringify(input);
    }
    const replayKey = `${teacherId}:${method}:${path}:${headers.get('Idempotency-Key')}`;
    if (method !== 'GET') {
      if (!z.uuid().safeParse(headers.get('Idempotency-Key')).success)
        return fail('A request key is required.', 'VALIDATION_ERROR', 422);
      const previous = replays.get(replayKey);
      if (previous)
        return previous.fingerprint === fingerprint
          ? json(previous.body, previous.status)
          : fail('Request key was reused with different content.');
    }
    function commit(value: unknown, status = 200) {
      replays.set(replayKey, { fingerprint, body: structuredClone(value), status });
      return json(value, status);
    }
    if (path === '/exams' && method === 'POST') {
      const parsed = metadataSchema.safeParse(body);
      if (!parsed.success) return fail('Check your exam details.', 'VALIDATION_ERROR', 422);
      if (!assignments.some((a) => a.assignmentId === parsed.data.assignmentId))
        return fail('Unknown teaching assignment.', 'FORBIDDEN', 403);
      const d: Draft = {
        ...parsed.data,
        examId: crypto.randomUUID(),
        revision: 1,
        status: 'draft',
        totalMarks: 0,
        itemCount: 0,
        reviewedCount: 0,
        importId: null,
        returnComment: null,
      };
      drafts.set(d.examId, d);
      store.draftOwners.set(d.examId, teacherId);
      papers.set(d.examId, []);
      return commit(d, 201);
    }
    const examMatch =
      /^\/exams\/([^/]+)(?:\/(items|submit-for-approval|generate|review-all|remove))?$/.exec(path);
    if (examMatch) {
      const d = drafts.get(examMatch[1] ?? '');
      if (!d || !own(d.examId)) return fail('Paper not found.', 'NOT_FOUND', 404);
      const part = examMatch[2];
      if (method === 'GET')
        return part === 'items'
          ? json({ revision: d.revision, items: papers.get(d.examId) })
          : json(d);
      const r = revisionSchema.safeParse(body);
      if (!r.success || r.data.revision !== d.revision)
        return fail('This paper changed. Reload it before saving your edits.');
      if (
        !['draft', 'returned'].includes(d.status) ||
        (part !== 'remove' && d.importId && due.has(d.importId))
      )
        return fail('This paper is currently read-only.');
      if (method === 'POST' && part === 'review-all') {
        const confirmed = z.object({ confirmed: z.literal(true) }).safeParse(body);
        if (!confirmed.success) return fail('Confirm the bulk review.', 'VALIDATION_ERROR', 422);
        const eligible = (papers.get(d.examId) ?? []).filter(
          (i) => !i.reviewed && itemSchema.safeParse({ ...i, reviewed: true }).success,
        );
        if (!eligible.length) return fail('No eligible questions.', 'VALIDATION_ERROR', 422);
        eligible.forEach((i) => {
          i.reviewed = true;
        });
        d.revision++;
        updateCounts(d);
        return commit(d);
      }
      if (method === 'POST' && part === 'remove') {
        if (
          !z
            .object({ confirmed: z.literal(true), reason: z.string().trim().min(1) })
            .safeParse(body).success
        )
          return fail('Confirm removal with a reason.', 'VALIDATION_ERROR', 422);
        if (d.importId) due.delete(d.importId);
        drafts.delete(d.examId);
        return commit({ id: d.examId, outcome: 'archived' });
      }
      if (method === 'POST' && part === 'generate') {
        if (!store.directory.aiExamSettings.aiExamGenerationEnabled)
          return fail('AI exam generation is disabled for this school.', 'FORBIDDEN', 403);
        const parsed = generationInputSchema.safeParse(body);
        if (!parsed.success)
          return fail('Check the generation parameters.', 'VALIDATION_ERROR', 422);
        if (d.itemCount && !parsed.data.replaceExisting)
          return fail('Confirm replacing existing questions.', 'VALIDATION_ERROR', 422);
        const v = parsed.data;
        const items = Array.from({ length: v.mcqCount + v.trueFalseCount }, (_, i) => {
          const sample = sampleItems()[i < v.mcqCount ? 0 : 1];
          if (!sample) throw new Error('Missing synthetic question');
          return {
            ...sample,
            itemId: crypto.randomUUID(),
            externalId: `AI-${i + 1}`,
            stem: `[Synthetic example ${i + 1}] ${sample.stem}`,
            marks: v.marksPerQuestion,
            keyConsistent: null,
            reviewFlags: [],
            reviewed: false,
          };
        });
        const id = crypto.randomUUID();
        const j: Job = {
          importId: id,
          examId: d.examId,
          state: 'queued',
          parsedCount: 0,
          completedCount: 0,
          sourceName: 'AI-generated exam (synthetic demo)',
          sourceSha256: '',
          failure: null,
          diagnostics: [],
        };
        jobs.set(id, j);
        d.importId = id;
        d.revision++;
        due.set(id, {
          at: clock() + 1200,
          items,
          generated: true,
          policyRevision: store.directory.aiExamSettings.revision,
        });
        return commit(j, 202);
      }
      if (method === 'PATCH' && !part) {
        const parsed = metadataSchema.safeParse(body);
        if (!parsed.success) return fail('Check your exam details.', 'VALIDATION_ERROR', 422);
        if (
          !assignments.some((a) => a.assignmentId === parsed.data.assignmentId) ||
          (d.itemCount > 0 && parsed.data.assignmentId !== d.assignmentId) ||
          (d.itemCount > 0 && parsed.data.language !== d.language)
        )
          return fail('The imported paper context cannot change.');
        Object.assign(d, parsed.data);
        d.revision++;
        return commit(d);
      }
      if (method === 'PATCH' && part === 'items') {
        const parsed = z.object({ item: itemSchema }).safeParse(body);
        if (!parsed.success)
          return fail(parsed.error.issues.map((i) => i.message).join(' '), 'VALIDATION_ERROR', 422);
        const p = papers.get(d.examId) ?? [];
        const i = p.findIndex((v) => v.itemId === parsed.data.item.itemId);
        const old = p[i];
        const item = parsed.data.item;
        if (
          !old ||
          old.type !== item.type ||
          old.externalId !== item.externalId ||
          JSON.stringify(old.options.map((o) => o.id)) !==
            JSON.stringify(item.options.map((o) => o.id)) ||
          old.keyConsistent !== item.keyConsistent ||
          JSON.stringify(old.reviewFlags) !== JSON.stringify(item.reviewFlags)
        )
          return fail('Question identity or AI evidence cannot be changed.');
        p[i] = item;
        d.revision++;
        updateCounts(d);
        return commit(d);
      }
      if (method === 'POST' && part === 'submit-for-approval') {
        const p = papers.get(d.examId) ?? [];
        if (!p.length || reviewProblems(p).length)
          return fail(
            'Review every question and resolve flags before submitting.',
            'AI_REVIEW_REQUIRED',
          );
        d.status = 'in_review';
        d.revision++;
        const history = store.history.get(d.examId) ?? [];
        history.push({
          action: 'submitted',
          actorName: store.directory.accounts.get(teacherId)?.displayName ?? 'Dawit',
          at: new Date(clock()).toISOString(),
          comment: 'Teacher submitted reviewed content.',
          revision: d.revision,
        });
        store.history.set(d.examId, history);
        return commit(d);
      }
    }
    if (path === '/imports' && method === 'POST') {
      const parsed = z
        .object({ examId: z.string(), revision: z.number(), name: z.string(), hash: z.string() })
        .safeParse(input);
      if (!parsed.success || !uploaded) return fail('Invalid upload.', 'VALIDATION_ERROR', 422);
      const v = parsed.data;
      const d = drafts.get(v.examId);
      if (!d || !own(d.examId)) return fail('Paper not found.', 'NOT_FOUND', 404);
      if (
        v.revision !== d.revision ||
        !['draft', 'returned'].includes(d.status) ||
        (d.importId && due.has(d.importId))
      )
        return fail('Paper changed or processing is already running.');
      if (uploaded.size > 5 * 1024 * 1024)
        return fail('File exceeds 5 MB.', 'PAYLOAD_TOO_LARGE', 413);
      const id = crypto.randomUUID();
      const items =
        v.hash === templateHashes.math20Xlsx
          ? math20Items()
          : [templateHashes.docx, templateHashes.xlsx].includes(v.hash)
            ? sampleItems()
            : null;
      const supported = items !== null;
      const j: Job = {
        importId: id,
        examId: d.examId,
        state: supported ? 'ai_running' : 'failed',
        parsedCount: items?.length ?? 0,
        completedCount: 0,
        sourceName: v.name,
        sourceSha256: v.hash,
        failure: supported
          ? null
          : 'Demo accepts only the unchanged downloadable examples. Edited templates need the real backend.',
        diagnostics: supported
          ? []
          : [{ row: 1, field: 'file', message: 'This file is not a bundled demo fixture.' }],
      };
      jobs.set(id, j);
      d.importId = id;
      d.revision++;
      if (items) due.set(id, { at: clock() + 1200, items });
      return commit(j, 202);
    }
    const jobMatch = /^\/imports\/([^/]+)(?:\/(ai-retry|cancel))?$/.exec(path);
    if (jobMatch) {
      const j = jobs.get(jobMatch[1] ?? '');
      if (!j || !own(j.examId)) return fail('Import not found.', 'NOT_FOUND', 404);
      if (method === 'GET') return json(j);
      if (method === 'POST' && jobMatch[2] === 'cancel') {
        const d = drafts.get(j.examId);
        const b = z
          .object({ revision: z.number().int().positive(), reason: z.string().trim().min(1) })
          .safeParse(body);
        if (
          !d ||
          !b.success ||
          b.data.revision !== d.revision ||
          !['draft', 'returned'].includes(d.status) ||
          d.importId !== j.importId
        )
          return fail('Refresh the editable draft.');
        due.delete(j.importId);
        j.state = 'cancelled';
        d.importId = null;
        d.revision++;
        return commit({ importId: j.importId, cancelled: true });
      }
      return fail('Only failed AI jobs with parsed content can be retried.');
    }
    return fail('Teacher endpoint not found.', 'NOT_FOUND', 404);
  };
}
