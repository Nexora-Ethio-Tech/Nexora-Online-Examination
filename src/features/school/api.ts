import {
  aiExamSettingsSchema,
  aiExamSettingsInputSchema,
} from '@/features/exams/authoring/generation-schemas';
import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';
import {
  accountSchema,
  assignmentSchema,
  auditSchema,
  classSchema,
  credentialIssueSchema,
  importResultSchema,
  pageSchema,
  previewSchema,
  subjectSchema,
  type AccountEdit,
} from './schemas';
const page = (cursor: string | null) =>
  `limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
export function schoolApi(client: ApiClient) {
  const write = <T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    key: string,
    method: 'POST' | 'PATCH' = 'POST',
  ) => client.request(path, schema, { method, body, idempotencyKey: key });
  return {
    aiSettings: (signal?: AbortSignal) =>
      client.request('/school/ai-exam-settings', aiExamSettingsSchema, { signal }),
    saveAiSettings: (body: import('zod').infer<typeof aiExamSettingsInputSchema>, key: string) =>
      write(
        '/school/ai-exam-settings',
        aiExamSettingsSchema,
        aiExamSettingsInputSchema.parse(body),
        key,
        'PATCH',
      ),
    classes: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/classes?${page(cursor)}`, pageSchema(classSchema), { signal }),
    subjects: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/subjects?${page(cursor)}`, pageSchema(subjectSchema), { signal }),
    accounts: (
      role: 'student' | 'teacher',
      search: string,
      cursor: string | null,
      signal?: AbortSignal,
    ) =>
      client.request(
        `/${role === 'teacher' ? 'teachers' : 'students'}?${page(cursor)}&search=${encodeURIComponent(search)}`,
        pageSchema(accountSchema),
        { signal },
      ),
    assignments: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/teacher-assignments?${page(cursor)}`, pageSchema(assignmentSchema), {
        signal,
      }),
    audit: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/admin/directory-audit?${page(cursor)}`, pageSchema(auditSchema), { signal }),
    saveClass: (id: string | null, body: unknown, key: string) =>
      write(
        `/classes${id ? `/${encodeURIComponent(id)}` : ''}`,
        classSchema,
        body,
        key,
        id ? 'PATCH' : 'POST',
      ),
    saveSubject: (id: string | null, body: unknown, key: string) =>
      write(
        `/subjects${id ? `/${encodeURIComponent(id)}` : ''}`,
        subjectSchema,
        body,
        key,
        id ? 'PATCH' : 'POST',
      ),
    createTeacher: (displayName: string, reason: string, key: string) =>
      write('/teachers', credentialIssueSchema, { displayName, reason }, key),
    editAccount: (role: 'student' | 'teacher', id: string, body: AccountEdit, key: string) =>
      write(
        `/${role === 'student' ? 'students' : 'teachers'}/${encodeURIComponent(id)}`,
        accountSchema,
        body,
        key,
        'PATCH',
      ),
    assign: (
      body: { teacherId: string; classId: string; subjectId: string; reason: string },
      key: string,
    ) => write('/teacher-assignments', assignmentSchema, body, key),
    setAssignment: (
      id: string,
      body: { revision: number; active: boolean; reason: string },
      key: string,
    ) =>
      write(`/teacher-assignments/${encodeURIComponent(id)}`, assignmentSchema, body, key, 'PATCH'),
    preview: (file: File, classId: string, key: string) => {
      const body = new FormData();
      body.set('file', file);
      body.set('classId', classId);
      return write('/students/import', previewSchema, body, key);
    },
    commit: (id: string, revision: number, reason: string, key: string) =>
      write(
        `/students/import/${encodeURIComponent(id)}/commit`,
        importResultSchema,
        { revision, reason },
        key,
      ),
    generate: (targets: { userId: string; revision: number }[], reason: string, key: string) =>
      write('/students/generate-credentials', credentialIssueSchema, { targets, reason }, key),
    reset: (
      account: { role: 'student' | 'teacher'; userId: string; revision: number },
      reason: string,
      key: string,
    ) =>
      write(
        `/${account.role === 'student' ? 'students' : 'teachers'}/${encodeURIComponent(account.userId)}/reset-password`,
        credentialIssueSchema,
        { revision: account.revision, reason },
        key,
      ),
  };
}
