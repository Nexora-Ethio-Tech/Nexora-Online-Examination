import type {
  Account,
  Assignment,
  CredentialIssue,
  DirectoryAudit,
  RosterPreview,
  SchoolClass,
  Subject,
} from '@/features/school/schemas';
// Demo only. Production passwords MUST use server-side Argon2id, never this fast digest.
export async function demoPasswordHash(password: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export function createDirectoryStore() {
  const accounts = new Map<string, Account>();
  for (const role of ['student', 'teacher'] as const)
    accounts.set(`demo-${role}`, {
      userId: `demo-${role}`,
      loginId: `DEMO-${role.toUpperCase()}`,
      displayName: role === 'student' ? 'Samira' : 'Dawit',
      role,
      studentRef: role === 'student' ? 'DEMO-001' : null,
      classId: role === 'student' ? 'demo-class-10a' : null,
      revision: 1,
      status: 'active',
      credentialState: 'issued',
    });
  return {
    aiExamSettings: { aiExamGenerationEnabled: false, revision: 1 },
    classes: new Map<string, SchoolClass>([
      [
        'demo-class-10a',
        {
          classId: 'demo-class-10a',
          name: 'Grade 10 A',
          academicYear: '2026',
          revision: 1,
          active: true,
        },
      ],
    ]),
    subjects: new Map<string, Subject>([
      [
        'demo-subject-math',
        {
          subjectId: 'demo-subject-math',
          name: 'Mathematics',
          code: 'MATH',
          revision: 1,
          active: true,
        },
      ],
    ]),
    assignments: new Map<string, Assignment>([
      [
        'demo-math-10a',
        {
          assignmentId: 'demo-math-10a',
          teacherId: 'demo-teacher',
          classId: 'demo-class-10a',
          subjectId: 'demo-subject-math',
          teacherName: 'Dawit',
          className: 'Grade 10 A',
          subjectName: 'Mathematics',
          revision: 1,
          active: true,
        },
      ],
    ]),
    accounts,
    passwords: new Map(
      [...accounts.keys()].map((id) => [
        id,
        { hash: demoPasswordHash('NexoraDemo!'), generation: 1 },
      ]),
    ),
    previews: new Map<
      string,
      {
        preview: RosterPreview;
        classRevision: number;
        committed: { importId: string; createdCount: number; userIds: string[] } | null;
      }
    >(),
    audit: [] as DirectoryAudit[],
    replays: new Map<string, { payload: string; response: unknown }>(),
    issues: new Map<string, Omit<CredentialIssue, 'credentials'>>(),
    queue: Promise.resolve(),
    sequence: 1,
    studentSequence: 1,
  };
}
