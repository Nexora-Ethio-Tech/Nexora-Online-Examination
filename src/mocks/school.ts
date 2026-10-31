import { demoStudentLogin, demoAccountPassword } from './account-credentials';
import { aiExamSettingsInputSchema } from '@/features/exams/authoring/generation-schemas';
import { z } from 'zod';
import {
  accountEditSchema,
  assignmentInputSchema,
  classInputSchema,
  reasonSchema,
  optionalNoteSchema,
  subjectInputSchema,
  targetsSchema,
  type Account,
  type CredentialIssue,
  type RosterPreview,
} from '@/features/school/schemas';
import type { AuthoringStore } from './authoring-store';
import { demoPasswordHash } from './directory-store';
import { parseRosterCsv } from './roster-csv';
const text = z.string().trim().min(1).max(160);
const edit = z.object({ revision: z.number().int().positive(), reason: reasonSchema });
const optionalEdit = edit.extend({ reason: optionalNoteSchema });
const switchSchema = optionalEdit.extend({ active: z.boolean() });
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function createSchoolDemo(store: AuthoringStore, clock = Date.now) {
  const d = store.directory;
  const now = () => new Date(clock()).toISOString();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  const fail = (message: string, code = 'REVISION_CONFLICT', status = 409) =>
    json({ code, message, details: [], requestId: 'demo-directory' }, status);
  const audit = (action: string, target: string, reason: string) =>
    d.audit.unshift({
      auditId: crypto.randomUUID(),
      action,
      target,
      targetLabel:
        d.accounts.get(target)?.loginId ??
        d.classes.get(target)?.name ??
        d.subjects.get(target)?.name ??
        d.issues
          .get(target)
          ?.accounts.map((a) => a.loginId)
          .join(', ') ??
        (d.previews.has(target)
          ? `Roster import: ${d.previews.get(target)?.preview.className}`
          : d.assignments.has(target)
            ? `${d.assignments.get(target)?.teacherName} · ${d.assignments.get(target)?.className} · ${d.assignments.get(target)?.subjectName}`
            : target),
      reason,
      actorName: 'Hana',
      at: now(),
    });
  const makeAccount = (
    role: Account['role'],
    displayName: string,
    classId: string | null,
    studentRef: string | null,
  ): Account => ({
    userId: crypto.randomUUID(),
    displayName,
    loginId:
      role === 'student'
        ? demoStudentLogin(d.studentSequence++, new Date(now()))
        : role === 'teacher'
          ? `TCH/001/${String(d.teacherSequence++).padStart(4, '0')}`
          : `DEMO-INV${String(d.sequence++).padStart(6, '0')}`,
    role,
    classId,
    studentRef,
    status: 'active',
    credentialState: 'unissued',
    revision: 1,
  });
  function issue(accounts: Account[], reason: string): CredentialIssue {
    const credentials = accounts.map((a) => {
      const password = demoAccountPassword();
      d.passwords.set(a.userId, {
        hash: demoPasswordHash(password),
        generation: (d.passwords.get(a.userId)?.generation ?? 0) + 1,
      });
      a.revision++;
      a.credentialState = 'issued';
      return { userId: a.userId, displayName: a.displayName, loginId: a.loginId, password };
    });
    const metadata = {
      issueId: crypto.randomUUID(),
      issuedCount: accounts.length,
      issuedAt: now(),
      accounts: accounts.map(({ userId, displayName, loginId }) => ({
        userId,
        displayName,
        loginId,
      })),
    };
    d.issues.set(metadata.issueId, metadata);
    audit('credentials_issued', metadata.issueId, reason);
    return { ...metadata, credentials };
  }
  const assignmentView = () =>
    [...d.assignments.values()].map((a) => ({
      ...a,
      teacherName: d.accounts.get(a.teacherId)?.displayName ?? a.teacherName,
      className: d.classes.get(a.classId)?.name ?? a.className,
      grade: d.classes.get(a.classId)?.grade ?? null,
      subjectName: d.subjects.get(a.subjectId)?.name ?? a.subjectName,
    }));
  async function handle(url: URL, method: string, body: unknown, headers: Headers) {
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (method === 'GET') {
      if (path === '/school/ai-exam-settings') return json(d.aiExamSettings);
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const search = url.searchParams.get('search') ?? '';
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        search.length > 160
      )
        return fail('Invalid list filter or page.', 'VALIDATION_ERROR', 422);
      const rows =
        path === '/classes'
          ? [...d.classes.values()]
              .filter((c) => c.active)
              .map((c) => ({
                ...c,
                studentCount: [...d.accounts.values()].filter(
                  (a) => a.role === 'student' && a.classId === c.classId,
                ).length,
              }))
          : path === '/subjects'
            ? [...d.subjects.values()]
            : path === '/teacher-assignments'
              ? assignmentView().filter(
                  (a) =>
                    (!url.searchParams.get('grade') ||
                      (a.grade ?? 'unclassified') === url.searchParams.get('grade')) &&
                    (!url.searchParams.get('classId') ||
                      a.classId === url.searchParams.get('classId')) &&
                    (!url.searchParams.get('subjectId') ||
                      a.subjectId === url.searchParams.get('subjectId')) &&
                    (!url.searchParams.get('teacherId') ||
                      a.teacherId === url.searchParams.get('teacherId')) &&
                    [a.teacherName, a.className, a.subjectName].some((v) =>
                      normalize(v).includes(normalize(search)),
                    ),
                )
              : path === '/admin/directory-audit'
                ? d.audit
                : path === '/students' || path === '/teachers' || path === '/invigilators'
                  ? [...d.accounts.values()].filter(
                      (a) =>
                        a.role ===
                          (path === '/students'
                            ? 'student'
                            : path === '/teachers'
                              ? 'teacher'
                              : 'invigilator') &&
                        (!url.searchParams.get('classId') ||
                          (a.classId ?? 'unassigned') === url.searchParams.get('classId')) &&
                        [a.displayName, a.loginId, a.studentRef ?? ''].some((v) =>
                          normalize(v).includes(normalize(search)),
                        ),
                    )
                  : null;
      if (!rows) return fail('Directory endpoint not found.', 'NOT_FOUND', 404);
      return json({
        items: rows.slice(offset, offset + limit),
        nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
        serverNow: now(),
      });
    }
    const key = headers.get('Idempotency-Key');
    if (!z.uuid().safeParse(key).success)
      return fail('A retained request key is required.', 'VALIDATION_ERROR', 422);
    let fingerprint = JSON.stringify(body);
    let csv: string | null = null;
    let csvClass: string | null = null;
    if (body instanceof FormData) {
      const file = body.get('file');
      const classId = body.get('classId');
      if (
        !(file instanceof File) ||
        typeof classId !== 'string' ||
        !['.csv', '.xlsx'].some((ext) => file.name.toLowerCase().endsWith(ext))
      )
        return fail('Choose an Excel or CSV roster and class.', 'VALIDATION_ERROR', 422);
      if (file.size > 2 * 1024 * 1024)
        return fail('Each CSV upload may be at most 2 MiB.', 'PAYLOAD_TOO_LARGE', 413);
      try {
        if (file.name.toLowerCase().endsWith('.xlsx')) {
          const digest = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
          )
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          if (digest !== '406348875901c3d053e88c891ef1cefa9b8c6ff83fa3a80d8e8fa38eb87dd4cb')
            return fail(
              'Demo mode supports the supplied Excel example only. Use the integrated backend for other Excel rosters.',
              'VALIDATION_ERROR',
              422,
            );
          csv =
            "First name,Father's name,Grandfather's name\nHana,Dawit,Getachew\nSamuel,Abebe,Tesfaye\nMekdes,Kebede,Tadesse";
        } else csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        return fail('The CSV must use UTF-8 text.', 'VALIDATION_ERROR', 422);
      }
      csvClass = classId;
      fingerprint = JSON.stringify({ classId, csv });
    }
    const replayKey = `${method}:${path}:${key}`;
    const previous = d.replays.get(replayKey);
    if (previous)
      return previous.payload === fingerprint
        ? json(previous.response)
        : fail('This request key was used for different content.');
    function commit(response: unknown, secret = false) {
      // Never keep plaintext credential responses in the replay map.
      const recorded = secret
        ? {
            ...z
              .object({
                issueId: z.string(),
                issuedCount: z.number(),
                issuedAt: z.string(),
                accounts: z.array(
                  z.object({ userId: z.string(), displayName: z.string(), loginId: z.string() }),
                ),
              })
              .parse(response),
            credentials: null,
          }
        : structuredClone(response);
      d.replays.set(replayKey, { payload: fingerprint, response: recorded });
      return json(response);
    }
    const removal =
      /^\/directory\/(classes|subjects|students|teachers|invigilators|teacher-assignments)\/([^/]+)\/remove$/.exec(
        path,
      );
    if (removal && method === 'POST') {
      const kind = removal[1],
        id = removal[2] ?? '';
      const b = edit.extend({ confirmed: z.literal(true) }).safeParse(body);
      const row =
        kind === 'classes'
          ? d.classes.get(id)
          : kind === 'subjects'
            ? d.subjects.get(id)
            : kind === 'teacher-assignments'
              ? d.assignments.get(id)
              : d.accounts.get(id);
      if (!row) return fail('Record not found.', 'NOT_FOUND', 404);
      if (!b.success || row.revision !== b.data.revision)
        return fail('Refresh before removing this record.');
      const used =
        kind === 'classes' ||
        [...d.assignments.values()].some(
          (a) => a.classId === id || a.subjectId === id || a.teacherId === id,
        ) ||
        [...d.accounts.values()].some((a) => a.classId === id) ||
        [...store.drafts.values()].some((a) => a.assignmentId === id) ||
        ('credentialState' in row && row.credentialState === 'issued');
      audit(used ? 'record_archived' : 'record_deleted', id, b.data.reason);
      if (used) {
        if ('status' in row) row.status = 'inactive';
        else row.active = false;
        row.revision++;
      } else if (kind === 'classes') d.classes.delete(id);
      else if (kind === 'subjects') d.subjects.delete(id);
      else if (kind === 'teacher-assignments') d.assignments.delete(id);
      else d.accounts.delete(id);
      return commit({ id, outcome: used ? 'archived' : 'deleted' });
    }
    if (path === '/school/ai-exam-settings' && method === 'PATCH') {
      const parsed = aiExamSettingsInputSchema.safeParse(body);
      if (!parsed.success)
        return fail('Check the setting and optional note.', 'VALIDATION_ERROR', 422);
      if (parsed.data.revision !== d.aiExamSettings.revision)
        return fail('School settings changed; refresh before saving.');
      d.aiExamSettings = {
        aiExamGenerationEnabled: parsed.data.aiExamGenerationEnabled,
        revision: d.aiExamSettings.revision + 1,
      };
      audit('ai_exam_settings', 'AI exam generation', parsed.data.reason);
      return commit(d.aiExamSettings);
    }
    if (path === '/students/import' && method === 'POST') {
      const schoolClass = csvClass ? d.classes.get(csvClass) : undefined;
      if (!schoolClass?.active) return fail('Choose an active class.', 'VALIDATION_ERROR', 422);
      if (csv === null) return fail('Upload a CSV file.', 'VALIDATION_ERROR', 422);
      let records: string[][];
      try {
        records = parseRosterCsv(csv);
      } catch {
        return fail(
          'Invalid CSV quoting. Use the provided header and quoted CSV format.',
          'VALIDATION_ERROR',
          422,
        );
      }
      const legacy = records[0]?.join(',') === 'studentRef,displayName';
      const roll =
        records[0]?.join(',') === "Roll number,First name,Father's name,Grandfather's name";
      if (
        !legacy &&
        !roll &&
        records[0]?.join(',') !== "First name,Father's name,Grandfather's name"
      )
        return fail('Use the downloadable roster headers.', 'VALIDATION_ERROR', 422);
      const existingInClass = [...d.accounts.values()].filter(
        (a) => a.classId === schoolClass.classId && a.role === 'student',
      );
      let currentRoll = 0;
      for (const a of existingInClass) {
        const match = /_(\d+)$/.exec(a.studentRef ?? '');
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > currentRoll) currentRoll = num;
        }
      }
      if (currentRoll === 0) {
        currentRoll = existingInClass.length;
      }
      const rollNumbers = records.slice(1).map((r) => {
        const explicit = roll ? (r[0] ?? '').trim() : '';
        if (explicit) {
          const num = parseInt(explicit, 10);
          if (!isNaN(num) && num > currentRoll) currentRoll = num;
          return explicit;
        }
        if (!legacy) {
          currentRoll++;
          return String(currentRoll);
        }
        return '';
      });
      if (!legacy) {
        records = [
          ['studentRef', 'displayName'],
          ...records.slice(1).map((r, i) => [
            'roster_' + schoolClass.classId + '_' + rollNumbers[i],
            r
              .slice(roll ? 1 : 0)
              .map((n) => n.trim())
              .join(' '),
          ]),
        ];
      }
      if (records.length < 2 || records.length > 2001)
        return fail('Upload between 1 and 2,000 student rows per file.', 'VALIDATION_ERROR', 422);
      const refs = records.slice(1).map((r) => normalize(r[0] ?? ''));
      const rows = records.slice(1).map((r, n) => {
        const studentRef = (r[0] ?? '').trim();
        const displayName = (r[1] ?? '').trim();
        const errors: { field: string; message: string }[] = [];
        if (r.length !== 2) errors.push({ field: 'row', message: 'Expected exactly two fields.' });
        if (legacy && !/^[A-Za-z0-9_-]{1,64}$/.test(studentRef))
          errors.push({
            field: 'studentRef',
            message: 'Use 1–64 letters, numbers, underscores or hyphens.',
          });
        if (!text.safeParse(displayName).success)
          errors.push({ field: 'displayName', message: 'Enter a name of 1–160 characters.' });
        if (refs.filter((v) => v === normalize(studentRef)).length > 1)
          errors.push({
            field: 'studentRef',
            message: 'This reference appears more than once in the file.',
          });
        if (
          [...d.accounts.values()].some(
            (a) => a.studentRef && normalize(a.studentRef) === normalize(studentRef),
          )
        )
          errors.push({
            field: 'studentRef',
            message: 'This student reference already exists in this school.',
          });
        return { row: n + 2, studentRef, displayName, rollNumber: rollNumbers[n], errors };
      });
      const preview: RosterPreview = {
        importId: crypto.randomUUID(),
        revision: 1,
        classId: schoolClass.classId,
        className: schoolClass.name,
        expiresAt: new Date(clock() + 30 * 60000).toISOString(),
        rows,
        canCommit: rows.every((r) => !r.errors.length),
        totalRows: rows.length,
      };
      d.previews.set(preview.importId, {
        preview,
        classRevision: schoolClass.revision,
        committed: null,
      });
      return commit(preview);
    }
    const importMatch = /^\/students\/import\/([^/]+)\/commit$/.exec(path);
    if (importMatch && method === 'POST') {
      const record = d.previews.get(importMatch[1] ?? '');
      if (!record) return fail('Import not found.', 'NOT_FOUND', 404);
      const parsed = optionalEdit
        .extend({ issueCredentials: z.boolean().default(false) })
        .strict()
        .safeParse(body);
      if (!parsed.success) return fail('Check the preview revision.', 'VALIDATION_ERROR', 422);
      if (record.committed) return commit(record.committed);
      const p = record.preview;
      const cls = d.classes.get(p.classId);
      if (
        !p.canCommit ||
        clock() >= Date.parse(p.expiresAt) ||
        parsed.data.revision !== p.revision ||
        !cls?.active ||
        cls.revision !== record.classRevision ||
        p.rows.some((r) =>
          [...d.accounts.values()].some(
            (a) => a.studentRef && normalize(a.studentRef) === normalize(r.studentRef),
          ),
        )
      )
        return fail(
          'This preview is invalid, expired or conflicts with changed school data. Upload again.',
        );
      const accounts = p.rows.map((r) =>
        makeAccount('student', r.displayName, p.classId, r.studentRef),
      );
      accounts.forEach((a) => d.accounts.set(a.userId, a));
      const loginDetails = parsed.data.issueCredentials
        ? issue(accounts, parsed.data.reason)
        : undefined;
      const result = {
        ...(loginDetails ? { loginDetails } : {}),
        importId: p.importId,
        createdCount: accounts.length,
        userIds: accounts.map((a) => a.userId),
      };
      record.committed = {
        ...result,
        ...(loginDetails ? { loginDetails: { ...loginDetails, credentials: null } } : {}),
      };
      audit('roster_imported', p.importId, parsed.data.reason);
      // Persist only redacted replay metadata, including the nested credential issue.
      d.replays.set(replayKey, {
        payload: fingerprint,
        response: structuredClone(record.committed),
      });
      return json(result);
    }
    const entity = /^\/(classes|subjects)(?:\/([^/]+))?$/.exec(path);
    if (entity && (method === 'POST' || method === 'PATCH')) {
      const kind = entity[1];
      const id = entity[2];
      if ((method === 'POST') === !!id) return fail('Endpoint not found.', 'NOT_FOUND', 404);
      if (kind === 'classes') {
        const parsed = (
          id
            ? classInputSchema.merge(switchSchema)
            : classInputSchema.extend({ reason: optionalNoteSchema })
        )
          .strict()
          .safeParse(body);
        if (!parsed.success)
          return fail('Enter the class name and academic year.', 'VALIDATION_ERROR', 422);
        const old = id ? d.classes.get(id) : undefined;
        if (id && !old) return fail('Class not found.', 'NOT_FOUND', 404);
        const fields = parsed.data;
        const changes = id ? switchSchema.parse(body) : null;
        if (old && old.revision !== changes?.revision)
          return fail('Class changed. Refresh before editing.');
        if (
          [...d.classes.values()].some(
            (c) =>
              c.classId !== id &&
              normalize(c.name) === normalize(fields.name) &&
              normalize(c.academicYear) === normalize(fields.academicYear),
          )
        )
          return fail('A class with this name already exists in this year.');
        if (
          changes &&
          !changes.active &&
          ([...d.accounts.values()].some((a) => a.classId === id && a.status === 'active') ||
            [...d.assignments.values()].some(
              (a) =>
                a.classId === id &&
                (a.active ||
                  [...store.drafts.values()].some(
                    (draft) => draft.assignmentId === a.assignmentId,
                  )),
            ))
        )
          return fail('This class still has active students, assignments or exam records.');
        const result = {
          classId: id ?? crypto.randomUUID(),
          name: fields.name,
          academicYear: fields.academicYear,
          grade: fields.grade ?? null,
          section: fields.section ?? null,
          active: changes?.active ?? true,
          revision: (old?.revision ?? 0) + 1,
        };
        d.classes.set(result.classId, result);
        audit('class_saved', result.classId, fields.reason);
        return commit(result);
      }
      const parsed = (
        id
          ? subjectInputSchema.merge(switchSchema)
          : subjectInputSchema.extend({ reason: optionalNoteSchema })
      )
        .strict()
        .safeParse(body);
      if (!parsed.success)
        return fail('Enter a subject name and valid code.', 'VALIDATION_ERROR', 422);
      const old = id ? d.subjects.get(id) : undefined;
      if (id && !old) return fail('Subject not found.', 'NOT_FOUND', 404);
      const fields = parsed.data;
      const changes = id ? switchSchema.parse(body) : null;
      if (old && old.revision !== changes?.revision)
        return fail('Subject changed. Refresh before editing.');
      if (
        [...d.subjects.values()].some(
          (s) =>
            s.subjectId !== id &&
            normalize(s.code) === normalize(fields.code) &&
            (s.grade ?? null) === (fields.grade ?? null),
        )
      )
        return fail('This subject code already exists.');
      if (
        changes &&
        !changes.active &&
        [...d.assignments.values()].some(
          (a) =>
            a.subjectId === id &&
            (a.active ||
              [...store.drafts.values()].some((draft) => draft.assignmentId === a.assignmentId)),
        )
      )
        return fail('This subject still has active assignments or exam records.');
      const result = {
        subjectId: id ?? crypto.randomUUID(),
        name: fields.name,
        code: fields.code.toUpperCase(),
        grade: fields.grade ?? null,
        active: changes?.active ?? true,
        revision: (old?.revision ?? 0) + 1,
      };
      d.subjects.set(result.subjectId, result);
      audit('subject_saved', result.subjectId, fields.reason);
      return commit(result);
    }
    if ((path === '/teachers' || path === '/invigilators') && method === 'POST') {
      const parsed = z
        .object({
          displayName: text,
          firstName: text.optional(),
          fatherName: text.optional(),
          grandfatherName: text.optional(),
          reason: optionalNoteSchema,
        })
        .strict()
        .safeParse(body);
      if (!parsed.success) return fail('Enter the staff name.', 'VALIDATION_ERROR', 422);
      const account = makeAccount(
        path === '/invigilators' ? 'invigilator' : 'teacher',
        parsed.data.displayName,
        null,
        null,
      );
      d.accounts.set(account.userId, account);
      audit('teacher_created', account.userId, parsed.data.reason);
      return commit(issue([account], parsed.data.reason), true);
    }
    if (path === '/students/generate-credentials' && method === 'POST') {
      const parsed = z
        .object({ targets: targetsSchema, reason: optionalNoteSchema })
        .strict()
        .safeParse(body);
      if (!parsed.success) return fail('Select 1–500 students.', 'VALIDATION_ERROR', 422);
      const { targets, reason } = parsed.data;
      const accounts = targets.map((t) => d.accounts.get(t.userId));
      if (accounts.some((a) => !a || a.role !== 'student'))
        return fail('Account not found.', 'NOT_FOUND', 404);
      if (
        new Set(targets.map((t) => t.userId)).size !== targets.length ||
        accounts.some(
          (a, i) =>
            !a ||
            a.role !== 'student' ||
            a.status !== 'active' ||
            a.credentialState !== 'unissued' ||
            a.revision !== targets[i]?.revision,
        )
      )
        return fail(
          'A selected student changed, is unavailable or already has credentials. Refresh the list.',
        );
      return commit(
        issue(
          accounts.filter((a): a is Account => !!a),
          reason,
        ),
        true,
      );
    }
    const accountMatch =
      /^\/(students|teachers|invigilators)\/([^/]+)(?:\/(reset-password))?$/.exec(path);
    if (accountMatch) {
      const account = d.accounts.get(accountMatch[2] ?? '');
      if (
        !account ||
        account.role !==
          (accountMatch[1] === 'students'
            ? 'student'
            : accountMatch[1] === 'teachers'
              ? 'teacher'
              : 'invigilator')
      )
        return fail('Account not found.', 'NOT_FOUND', 404);
      const parsed = (accountMatch[3] ? edit : optionalEdit).safeParse(body);
      if (!parsed.success)
        return fail('Enter the account revision and reason.', 'VALIDATION_ERROR', 422);
      if (account.revision !== parsed.data.revision)
        return fail('Account changed. Refresh before continuing.');
      if (accountMatch[3] && method === 'POST') {
        if (!edit.strict().safeParse(body).success)
          return fail('Unexpected reset fields.', 'VALIDATION_ERROR', 422);
        if (account.status !== 'active')
          return fail('Reactivate this account before resetting its password.');
        audit('password_reset', account.userId, parsed.data.reason);
        return commit(issue([account], parsed.data.reason), true);
      }
      if (!accountMatch[3] && method === 'PATCH') {
        const input = accountEditSchema.strict().safeParse(body);
        if (!input.success)
          return fail('Check the name, class and status.', 'VALIDATION_ERROR', 422);
        if (
          (account.role !== 'student' && input.data.classId !== null) ||
          (account.role === 'student' &&
            (!input.data.classId || !d.classes.get(input.data.classId)?.active))
        )
          return fail(
            'Choose an active student class; teachers use assignments.',
            'VALIDATION_ERROR',
            422,
          );
        if (account.status !== input.data.status && !input.data.reason.trim())
          return fail('Enter a reason for changing account status.', 'VALIDATION_ERROR', 422);
        const loginChanged = !!input.data.loginId && input.data.loginId !== account.loginId;
        if (
          [...d.accounts.values()].some(
            (a) => a.userId !== account.userId && a.loginId === input.data.loginId,
          )
        )
          return fail('This user ID is already in use.', 'VALIDATION_ERROR', 422);
        Object.assign(account, {
          displayName: input.data.displayName,
          loginId: input.data.loginId ?? account.loginId,
          classId: input.data.classId,
          status: input.data.status,
          revision: account.revision + 1,
        });
        if (account.status === 'inactive' || loginChanged) {
          const password = d.passwords.get(account.userId);
          if (password) password.generation++;
        }
        audit('account_updated', account.userId, input.data.reason);
        return commit(account);
      }
    }
    if (path === '/teacher-assignments' && method === 'POST') {
      const parsed = assignmentInputSchema
        .extend({ reason: optionalNoteSchema })
        .strict()
        .safeParse(body);
      if (!parsed.success)
        return fail('Select a teacher, class and subject.', 'VALIDATION_ERROR', 422);
      const { teacherId, classId, subjectId, reason } = parsed.data;
      const teacher = d.accounts.get(teacherId);
      const cls = d.classes.get(classId);
      const subject = d.subjects.get(subjectId);
      if (teacher?.role !== 'teacher' || !cls || !subject)
        return fail('School record not found.', 'NOT_FOUND', 404);
      if (
        teacher?.role !== 'teacher' ||
        teacher.status !== 'active' ||
        !cls?.active ||
        !subject?.active ||
        (cls.grade ?? null) !== (subject.grade ?? null)
      )
        return fail('Select active school records.', 'VALIDATION_ERROR', 422);
      if (
        [...d.assignments.values()].some(
          (a) => a.teacherId === teacherId && a.classId === classId && a.subjectId === subjectId,
        )
      )
        return fail('This assignment already exists. Reactivate it if needed.');
      const result = {
        assignmentId: crypto.randomUUID(),
        teacherId,
        classId,
        subjectId,
        teacherName: teacher.displayName,
        className: cls.name,
        subjectName: subject.name,
        revision: 1,
        active: true,
      };
      d.assignments.set(result.assignmentId, result);
      audit('assignment_created', result.assignmentId, reason);
      return commit(result);
    }
    const assignmentId = /^\/teacher-assignments\/([^/]+)$/.exec(path)?.[1];
    if (assignmentId && method === 'PATCH') {
      const a = d.assignments.get(assignmentId);
      if (!a) return fail('Assignment not found.', 'NOT_FOUND', 404);
      const parsed = switchSchema.strict().safeParse(body);
      if (!parsed.success)
        return fail('Check the revision and active state.', 'VALIDATION_ERROR', 422);
      if (a.revision !== parsed.data.revision) return fail('Assignment changed. Refresh first.');
      if (
        !parsed.data.active &&
        [...store.drafts.values()].some((draft) => draft.assignmentId === assignmentId)
      )
        return fail('An exam depends on this assignment. Keep it for the exam record.');
      if (
        parsed.data.active &&
        (d.accounts.get(a.teacherId)?.status !== 'active' ||
          !d.classes.get(a.classId)?.active ||
          !d.subjects.get(a.subjectId)?.active)
      )
        return fail('Reactivate the teacher, class and subject first.');
      a.active = parsed.data.active;
      a.revision++;
      audit('assignment_updated', assignmentId, parsed.data.reason);
      return commit(assignmentView().find((v) => v.assignmentId === assignmentId));
    }
    return fail('Directory endpoint not found.', 'NOT_FOUND', 404);
  }
  return (url: URL, method: string, body: unknown, headers: Headers) => {
    const result = d.queue.then(() => handle(url, method, body, headers));
    d.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
