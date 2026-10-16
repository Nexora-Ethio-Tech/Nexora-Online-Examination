import { z } from 'zod';

export function requireDisposableDatabase(): void {
  const url = new URL(z.string().parse(process.env.DATABASE_URL));
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/nexora_be02a_test') {
    throw new Error('Database tests require the disposable localhost nexora_be02a_test database');
  }
}

export function responseCookies(response: { headers: Record<string, unknown> }): string[] {
  const value = z.union([z.string(), z.array(z.string())]).parse(response.headers['set-cookie']);
  return typeof value === 'string' ? [value] : value;
}

export function responseCookie(
  response: { headers: Record<string, unknown> },
  name: string,
): string {
  const cookie = responseCookies(response).find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Expected ${name} cookie`);
  return cookie.split(';')[0];
}
