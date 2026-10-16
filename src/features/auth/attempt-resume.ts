import { z } from 'zod';
import type { Session } from './schemas';
import { roleHome } from './role-home';

const key = 'nexora-attempt-return';
const hintSchema = z.object({
  path: z.string().regex(/^\/student\/attempts\/[A-Za-z0-9_%.-]+$/),
  schoolId: z.string(),
  userId: z.string(),
});
export function isAttemptPath(path: string) {
  return hintSchema.shape.path.safeParse(path).success;
}
// This tab-local navigation hint is not a credential or permission to read answers.
export function rememberAttempt(session: Session, path: string) {
  try {
    if (session.user.role === 'student' && isAttemptPath(path)) {
      sessionStorage.setItem(
        key,
        JSON.stringify({ path, schoolId: session.school.id, userId: session.user.id }),
      );
    } else if (path !== '/login' && path !== '/mfa') {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* Navigation remains usable if browser storage is unavailable. */
  }
}
export function authenticatedDestination(session: Session) {
  try {
    const hint = hintSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
    if (
      hint.success &&
      session.user.role === 'student' &&
      hint.data.userId === session.user.id &&
      hint.data.schoolId === session.school.id
    )
      return hint.data.path;
  } catch {
    /* Never trust malformed navigation hints. */
  }
  return roleHome[session.user.role];
}
