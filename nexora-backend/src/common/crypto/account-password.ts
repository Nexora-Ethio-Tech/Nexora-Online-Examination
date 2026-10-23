import { randomInt } from 'node:crypto';

/** Uniform rejection sampling: every accepted password contains all four character classes. */
export function generateAccountPassword() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*?';
  for (;;) {
    const password = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!#$%&*?]/.test(password)
    )
      return password;
  }
}
