import { useAuth } from '@/features/auth/AuthProvider';
import { ReadError } from '@/components/shared/ReadError';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import type { RunnerEngine } from '@/features/runner/engine';
import { assistanceApi } from './api';

export function StudentAssistance({
  engine,
  attemptId,
  paused,
  saving,
}: {
  engine: RunnerEngine;
  attemptId: string;
  paused: boolean;
  saving: boolean;
}) {
  const client = useApiClient();
  const { session } = useAuth();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = useQuery({
    queryKey: ['assistance', session?.school.id, session?.user.id, 'student', attemptId],
    queryFn: ({ signal }) => assistanceApi(client).read(attemptId, signal),
    enabled: paused,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  async function request() {
    setBusy(true);
    setError('');
    try {
      await engine.requestAssistance(requestId);
      setRequestId(crypto.randomUUID());
      await status.refetch();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Exam assistance" className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Need help?</h2>
      <p className="text-sm">
        Requesting help pauses editing. Your original deadline still applies. A staff member
        approves from their own device.
      </p>
      {paused && status.data?.request && (
        <p role="status">
          Assistance request: {status.data.request.status}.
          {` Reference: ${status.data.request.id}.`}
          {status.data.request.reason && ` Staff note: ${status.data.request.reason}`}
          {!status.data.paused && ' Choose Try opening exam again to continue.'}
        </p>
      )}
      {error ? <p role="alert">{error}</p> : paused ? <ReadError error={status.error} /> : null}
      <Button
        variant="outline"
        disabled={busy || saving || (paused && status.data?.request?.status === 'pending')}
        onClick={() => void request()}
      >
        {busy ? 'Sending request…' : 'Pause and request assistance'}
      </Button>
      {paused && (
        <p className="text-xs">
          Status refreshes every 15 seconds while this page is visible. If sending fails, retry or
          ask staff for help; keep this browser and its saved work.
        </p>
      )}
    </section>
  );
}
