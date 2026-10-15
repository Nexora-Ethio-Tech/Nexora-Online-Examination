import type { Transport } from '@/lib/api-client';
import { loginSchema, mfaSchema, type Role, type Session } from '@/features/auth/schemas';
import { createExamDemo } from './exams';
import { createTeacherDemo } from './teacher';
import { createAuthoringStore } from './authoring-store';
import { createAdminDemo } from './admin';
import { createResultsDemo } from './results';
import { captureRecovery, createRecoveryDemo } from './recovery';
import { recoveryExample } from './recovery-example';
import { createPracticeDemo } from './practice';
import { createSchoolDemo } from './school';
import { demoPasswordHash } from './directory-store';

export function demoSession(role: Role): Session {
  return {
    user: {
      id: `demo-${role}`,
      loginId: role === 'school_admin' ? 'DEMO-ADMIN' : `DEMO-${role.toUpperCase()}`,
      displayName: role === 'student' ? 'Samira' : role === 'teacher' ? 'Dawit' : 'Hana',
      role,
    },
    school: { id: 'demo-school', name: 'Nexora Demo School', timezone: 'Africa/Addis_Ababa' },
    csrfToken: 'demo-authenticated-csrf',
    serverNow: new Date().toISOString(),
  };
}

// Development-only in-memory simulator, not an authentication implementation.
// Reload intentionally clears demo sessions. Real sessions belong to the API.
export function createDemoTransport(
  initialRole?: Role,
  clock?: () => number,
  store = createAuthoringStore(),
): Transport {
  const examDemo = createExamDemo(
    clock,
    () => [...store.sessions.values()],
    (attempt, answers) => {
      store.resultAttempts.set(attempt.sessionId, {
        attempt,
        answers: answers ?? store.resultAttempts.get(attempt.sessionId)?.answers ?? [],
      });
    },
    (attempt, body, reason, key, digest, paper) =>
      captureRecovery(store, attempt, body, reason, key, digest, paper),
  );
  const resultsDemo = createResultsDemo(store, clock);
  const practiceDemo = createPracticeDemo(store, clock);
  const recoveryDemo = createRecoveryDemo(
    store,
    (id) => resultsDemo.current(id)?.summary.revision ?? null,
    clock,
  );
  const teacherDemo = createTeacherDemo(clock, store);
  const adminDemo = createAdminDemo(store, clock);
  const schoolDemo = createSchoolDemo(store, clock);
  let role = initialRole;
  let actorId = initialRole ? `demo-${initialRole}` : undefined;
  let passwordGeneration = actorId ? (store.directory.passwords.get(actorId)?.generation ?? 0) : 0;
  let challenge = false;
  let csrf = role ? 'demo-authenticated-csrf' : 'demo-anonymous-csrf';
  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }
  function error(status: number, code: string, message: string) {
    return json({ code, message, details: [], requestId: 'demo-request' }, status);
  }
  return async (url, init) => {
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const path = new URL(url, 'http://localhost').pathname;
    const endpoint = path.slice(path.lastIndexOf('/auth/'));
    const method = init.method ?? 'GET';
    if (
      role &&
      role !== 'school_admin' &&
      actorId &&
      (store.directory.accounts.get(actorId)?.status !== 'active' ||
        store.directory.passwords.get(actorId)?.generation !== passwordGeneration)
    ) {
      role = undefined;
      actorId = undefined;
      csrf = 'demo-anonymous-csrf';
      if (endpoint !== '/auth/csrf' && endpoint !== '/auth/login')
        return error(401, 'AUTH_REQUIRED', 'Your account changed. Please sign in again.');
    }
    if (method !== 'GET' && new Headers(init.headers).get('X-CSRF-Token') !== csrf)
      return error(403, 'CSRF_INVALID', 'Security session changed.');
    if (endpoint === '/auth/csrf' && method === 'GET')
      return json({ csrfToken: csrf, serverNow: new Date().toISOString() });
    if (endpoint === '/auth/me' && method === 'GET')
      return role
        ? json({
            ...demoSession(role),
            ...(actorId && store.directory.accounts.has(actorId)
              ? {
                  user: {
                    id: actorId,
                    loginId: store.directory.accounts.get(actorId)?.loginId,
                    displayName: store.directory.accounts.get(actorId)?.displayName,
                    role,
                  },
                }
              : {}),
            csrfToken: csrf,
          })
        : error(401, 'AUTH_REQUIRED', 'Please sign in.');
    let body: unknown;
    try {
      body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    } catch {
      return error(422, 'VALIDATION_ERROR', 'Invalid JSON.');
    }
    if (endpoint === '/auth/login' && method === 'POST') {
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success)
        return error(422, 'VALIDATION_ERROR', 'Enter your user ID and password.');
      const account = [...store.directory.accounts.values()].find(
        (a) => a.loginId === parsed.data.loginId && a.status === 'active',
      );
      const stored = account ? store.directory.passwords.get(account.userId) : undefined;
      const adminLogin =
        parsed.data.loginId === 'DEMO-ADMIN' && parsed.data.password === 'NexoraDemo!';
      const selectedRole = adminLogin
        ? 'school_admin'
        : stored && (await stored.hash) === (await demoPasswordHash(parsed.data.password))
          ? account?.role
          : undefined;
      if (!selectedRole)
        return error(401, 'AUTH_REQUIRED', 'The user ID or password is incorrect.');
      actorId = adminLogin ? 'demo-school_admin' : account?.userId;
      passwordGeneration = stored?.generation ?? 0;
      role = undefined;
      challenge = selectedRole === 'school_admin';
      if (challenge) {
        csrf = 'demo-challenge-csrf';
        return json({ status: 'mfa_required', csrfToken: csrf });
      }
      role = selectedRole;
      csrf = 'demo-authenticated-csrf';
      return json({ status: 'authenticated' });
    }
    if (endpoint === '/auth/mfa/verify' && method === 'POST') {
      if (!challenge) return error(401, 'AUTH_REQUIRED', 'Verification session expired.');
      const parsed = mfaSchema.safeParse(body);
      if (!parsed.success || parsed.data.code !== '123456')
        return error(422, 'VALIDATION_ERROR', 'The verification code is incorrect.');
      role = 'school_admin';
      challenge = false;
      csrf = 'demo-authenticated-csrf';
      return json({ status: 'authenticated' });
    }
    if (endpoint === '/auth/logout' && method === 'POST') {
      role = undefined;
      challenge = false;
      csrf = 'demo-anonymous-csrf';
      return new Response(null, { status: 204 });
    }
    if (!role) return error(401, 'AUTH_REQUIRED', 'Please sign in.');
    const apiPath = path.replace(/^\/api\/v1/, '');
    if (
      /^\/(classes|subjects|teachers|students|teacher-assignments)(\/|$)/.test(apiPath) ||
      apiPath === '/admin/directory-audit'
    ) {
      if (role !== 'school_admin')
        return error(403, 'FORBIDDEN', 'Administrator access with MFA is required.');
      return schoolDemo(new URL(url, 'http://localhost'), method, body, new Headers(init.headers));
    }
    // Existing delivery/results examples contain one synthetic learner. Never
    // expose that learner's work to newly generated directory accounts.
    if (role === 'student' && actorId !== 'demo-student') {
      if (method === 'GET' && ['/me/exams', '/me/results', '/me/practice'].includes(apiPath))
        return json({
          items: [],
          nextCursor: null,
          serverNow: new Date((clock ?? Date.now)()).toISOString(),
        });
      return error(404, 'NOT_FOUND', 'No exam fixture is linked to this demo account.');
    }
    if (
      role === 'teacher' &&
      actorId !== 'demo-teacher' &&
      (apiPath.startsWith('/results/') ||
        apiPath.startsWith('/sessions/') ||
        apiPath.startsWith('/exports/'))
    ) {
      if (method === 'GET' && apiPath === '/results/sessions')
        return json({
          items: [],
          nextCursor: null,
          serverNow: new Date((clock ?? Date.now)()).toISOString(),
        });
      return error(404, 'NOT_FOUND', 'No result fixture is linked to this demo account.');
    }
    if (
      apiPath === '/admin/practice-exams' ||
      apiPath === '/me/practice' ||
      apiPath.startsWith('/practice-attempts/') ||
      /^\/exams\/[^/]+\/(practice-access|practice-attempts)$/.test(apiPath)
    )
      return practiceDemo(
        new URL(url, 'http://localhost'),
        method,
        body,
        new Headers(init.headers),
        role,
      );
    if (apiPath === '/demo/recovery-example' && method === 'POST') {
      if (role !== 'school_admin')
        return error(403, 'FORBIDDEN', 'Administrator access is required.');
      return json(await recoveryExample(store, clock));
    }
    if (apiPath.startsWith('/admin/recovery') || /^\/recovery\/[^/]+\/decision$/.test(apiPath)) {
      if (role !== 'school_admin')
        return error(403, 'FORBIDDEN', 'Administrator access with MFA is required.');
      return recoveryDemo(
        new URL(url, 'http://localhost'),
        method,
        body,
        new Headers(init.headers),
      );
    }
    if (
      apiPath === '/me/results' ||
      apiPath === '/results/sessions' ||
      apiPath.startsWith('/exports/') ||
      /^\/sessions\/[^/]+\/(results|analytics|results-publication)$/.test(apiPath)
    )
      return resultsDemo(
        new URL(url, 'http://localhost'),
        method,
        body,
        new Headers(init.headers),
        role,
      );
    if (
      apiPath.startsWith('/admin/exams') ||
      /^\/exams\/[^/]+\/(approve|return|sessions|package-retry)$/.test(apiPath) ||
      /^\/sessions\/[^/]+\/schedule$/.test(apiPath)
    ) {
      if (role !== 'school_admin')
        return error(403, 'FORBIDDEN', 'Administrator access with MFA is required.');
      return adminDemo(apiPath, method, body, new Headers(init.headers));
    }
    if (/^\/(exams|imports|me\/teaching-assignments)(\/|$)/.test(apiPath)) {
      if (role !== 'teacher') return error(403, 'FORBIDDEN', 'Teacher access is required.');
      return teacherDemo(
        apiPath,
        method,
        body,
        new Headers(init.headers),
        actorId ?? 'demo-teacher',
        new URL(url, 'http://localhost').searchParams,
      );
    }
    if (role !== 'student') return error(403, 'FORBIDDEN', 'Student access is required.');
    return examDemo(path.replace(/^\/api\/v1/, ''), method, body, new Headers(init.headers));
  };
}
