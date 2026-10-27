import { errorMessage, isConnectionError } from '@/lib/api-client';
export function ReadError({ error }: { error: unknown }) {
  return error && !isConnectionError(error) ? <p role="alert">{errorMessage(error)}</p> : null;
}
