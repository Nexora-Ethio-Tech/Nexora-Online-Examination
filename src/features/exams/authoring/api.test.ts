// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { authoringApi } from './api';
import { itemSchema, type Metadata } from './schemas';

const metadata: Metadata = {
  title: 'Algebra assessment',
  instructions: 'Choose one answer.',
  assignmentId: 'demo-math-10a',
  language: 'en',
  durationMinutes: 60,
  passPercent: 50,
  ordering: 'fixed',
};
function setup() {
  let now = Date.now();
  const client = new ApiClient(
    '/api/v1',
    createDemoTransport('teacher', () => now),
  );
  client.setCsrfToken('demo-authenticated-csrf');
  return {
    api: authoringApi(client),
    advance: () => {
      now += 5000;
    },
  };
}
async function template(extension: string) {
  return new File(
    [await readFile(`public/templates/nexora-questions.${extension}`)],
    `questions.${extension}`,
  );
}

describe('teacher authoring contract and demo', () => {
  it('bulk reviews eligible questions while leaving unresolved flags for individual attention', async () => {
    const { api, advance } = setup();
    const draft = await api.create(metadata, crypto.randomUUID());
    await api.upload(draft.examId, draft.revision, await template('xlsx'), crypto.randomUUID());
    advance();
    const items = await api.items(draft.examId);
    const key = crypto.randomUUID();
    const reviewed = await api.reviewAll(draft.examId, items.revision, key);
    expect(reviewed.reviewedCount).toBe(1);
    expect(await api.reviewAll(draft.examId, items.revision, key)).toEqual(reviewed);
    expect((await api.items(draft.examId)).items.find((i) => i.reviewFlags.length)?.reviewed).toBe(
      false,
    );
    await expect(
      api.submit(draft.examId, reviewed.revision, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'AI_REVIEW_REQUIRED' });
  });
  it('cancels a queued upload, permits a replacement and never applies the cancelled fixture', async () => {
    const { api, advance } = setup();
    const d = await api.create(metadata, crypto.randomUUID());
    const j = await api.upload(d.examId, d.revision, await template('xlsx'), crypto.randomUUID());
    const current = await api.get(d.examId);
    const key = crypto.randomUUID();
    await api.cancelImport(j.importId, current.revision, 'Wrong file', key);
    expect(await api.cancelImport(j.importId, current.revision, 'Wrong file', key)).toMatchObject({
      cancelled: true,
    });
    advance();
    expect((await api.items(d.examId)).items).toHaveLength(0);
    const restored = await api.get(d.examId);
    expect(restored.importId).toBeNull();
    await expect(
      api.upload(d.examId, restored.revision, await template('docx'), crypto.randomUUID()),
    ).resolves.toMatchObject({ examId: d.examId });
  });
  it.each(['docx', 'xlsx'])(
    'imports the exact %s fixture, requires resolved reviews and locks submission',
    async (extension) => {
      const { api, advance } = setup();
      const draft = await api.create(metadata, crypto.randomUUID());
      const uploadKey = crypto.randomUUID();
      const file = await template(extension);
      const job = await api.upload(draft.examId, draft.revision, file, uploadKey);
      expect(await api.upload(draft.examId, draft.revision, file, uploadKey)).toEqual(job);
      await expect(api.submit(draft.examId, 2, crypto.randomUUID())).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
      });
      advance();
      expect((await api.job(job.importId)).state).toBe('ready');
      let items = await api.items(draft.examId);
      expect(items.items).toHaveLength(2);
      expect(items.items.map((i) => i.correctOptionId)).toEqual(['B', 'true']);
      await expect(
        api.submit(draft.examId, items.revision, crypto.randomUUID()),
      ).rejects.toMatchObject({ code: 'AI_REVIEW_REQUIRED' });
      const first = items.items[0];
      const second = items.items[1];
      if (!first || !second) throw new Error('Fixture missing');
      await expect(
        api.saveItem(
          draft.examId,
          { ...second, reviewed: true },
          items.revision,
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const saved = await api.saveItem(
        draft.examId,
        { ...first, reviewed: true },
        items.revision,
        crypto.randomUUID(),
      );
      await expect(
        api.saveItem(
          draft.examId,
          { ...second, reviewed: true, reviewNote: 'Checked definition.' },
          items.revision,
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
      await api.saveItem(
        draft.examId,
        { ...second, reviewed: true, reviewNote: 'Checked definition.' },
        saved.revision,
        crypto.randomUUID(),
      );
      items = await api.items(draft.examId);
      const key = crypto.randomUUID();
      const submitted = await api.submit(draft.examId, items.revision, key);
      expect(submitted).toMatchObject({ status: 'in_review', totalMarks: 4, reviewedCount: 2 });
      expect(await api.submit(draft.examId, items.revision, key)).toEqual(submitted);
      await expect(
        api.save(draft.examId, metadata, submitted.revision, crypto.randomUUID()),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    },
  );
  it('rejects unsupported files without replacing previously imported questions', async () => {
    const { api, advance } = setup();
    const d = await api.create(metadata, crypto.randomUUID());
    await api.upload(d.examId, 1, await template('xlsx'), crypto.randomUUID());
    advance();
    const before = await api.items(d.examId);
    const job = await api.upload(
      d.examId,
      before.revision,
      new File(['not an OOXML file'], 'edited.xlsx'),
      crypto.randomUUID(),
    );
    expect(job.state).toBe('failed');
    expect(job.diagnostics[0]?.field).toBe('file');
    expect((await api.items(d.examId)).items).toEqual(before.items);
  });
  it('replays a lost create response and rejects changed payload under the same key', async () => {
    const { api } = setup();
    const key = crypto.randomUUID();
    const d = await api.create(metadata, key);
    expect(await api.create(metadata, key)).toEqual(d);
    await expect(api.create({ ...metadata, title: 'Changed' }, key)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    expect((await api.list(null)).items).toHaveLength(1);
  });
  it('sends multipart boundaries through fetch and protects PATCH with CSRF', async () => {
    let observed: RequestInit | undefined;
    const client = new ApiClient('/api/v1', async (_url, init) => {
      observed = init;
      return new Response('{}');
    });
    const api = authoringApi(client);
    await expect(api.save('id', metadata, 1, crypto.randomUUID())).rejects.toMatchObject({
      code: 'CSRF_REQUIRED',
    });
    client.setCsrfToken('token');
    await api.upload('id', 1, await template('docx'), crypto.randomUUID()).catch(() => undefined);
    expect(observed?.body).toBeInstanceOf(FormData);
    expect(new Headers(observed?.headers).has('Content-Type')).toBe(false);
    expect(new Headers(observed?.headers).get('X-CSRF-Token')).toBe('token');
  });
  it.each(['student', 'school_admin'] as const)(
    'denies %s access to teacher keys',
    async (role) => {
      const c = new ApiClient('/api/v1', createDemoTransport(role));
      c.setCsrfToken('demo-authenticated-csrf');
      await expect(authoringApi(c).list(null)).rejects.toMatchObject({ status: 403 });
      await expect(authoringApi(c).create(metadata, crypto.randomUUID())).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it('does not accept missing topics or fabricated answer choices as reviewed', () => {
    const base = {
      itemId: 'x',
      externalId: 'x',
      type: 'true_false',
      stem: 'True?',
      options: [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ],
      correctOptionId: 'missing',
      marks: 2,
      primaryTopic: '',
      secondaryTopics: [],
      explanation: '',
      keyConsistent: null,
      reviewFlags: [],
      reviewed: true,
      reviewNote: '',
    };
    expect(itemSchema.safeParse(base).success).toBe(false);
  });
});
