import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { supervisionApi } from '@/features/runner/supervision';
import { useAuth } from '@/features/auth/AuthProvider';
export function SupervisionPanel({ attemptId }: { attemptId: string }) {
  const client = useApiClient();
  const { session } = useAuth();
  const api = supervisionApi(client);
  const [reason, setReason] = useState('');
  const [command, setCommand] = useState<{
    action: 'suspend' | 'resume';
    reason: string;
    expectedRevision: number;
    key: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['supervision', session?.school.id, session?.user.id, attemptId],
    queryFn: ({ signal }) => supervisionApi(client, signal).read(attemptId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: (input: NonNullable<typeof command>) =>
      api.decide(
        attemptId,
        { action: input.action, reason: input.reason, expectedRevision: input.expectedRevision },
        input.key,
      ),
    onSuccess: () => {
      setCommand(null);
      setReason('');
      void query.refetch();
    },
  });
  const d = query.data;
  return (
    <section className="space-y-4 nexora-surface rounded-xl border bg-background p-5">
      <h2 className="text-xl font-semibold">Browser supervision</h2>
      <p className="text-sm">
        Interruptions are browser reports, not proof of cheating. Suspension requires your decision,
        keeps saved work and does not extend the deadline. Offline browsers receive it when they
        reconnect.
      </p>
      {query.isPending && <p role="status">Loading supervision…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh supervision
      </Button>
      {d && (
        <>
          <p role="status">
            {d.suspended ? 'Suspended — administrator approval required' : 'Not suspended'}
          </p>
          <label className="block">
            Reason for supervision decision
            <textarea
              className="mt-2 block w-full rounded border p-3"
              value={reason}
              maxLength={500}
              disabled={!!command}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            disabled={mutation.isPending || !!query.error || (!command && !reason.trim())}
            onClick={() => {
              const next = command ?? {
                action: d.suspended ? ('resume' as const) : ('suspend' as const),
                reason: reason.trim(),
                expectedRevision: d.revision,
                key: crypto.randomUUID(),
              };
              setCommand(next);
              mutation.mutate(next);
            }}
          >
            {mutation.isPending
              ? 'Saving decision…'
              : command
                ? 'Retry same decision'
                : d.suspended
                  ? 'Approve resuming exam'
                  : 'Suspend exam attempt'}
          </Button>
          {mutation.error && (
            <p role="alert">
              {mutation.error.message} Refresh to inspect the current state. An identical retry is
              safe.
            </p>
          )}
          {command && !mutation.isPending && (
            <Button
              variant="outline"
              onClick={() => {
                setCommand(null);
                mutation.reset();
                void query.refetch();
              }}
            >
              Clear decision form and refresh
            </Button>
          )}
          <h3 className="font-semibold">Recent interruptions (up to 100 recent records)</h3>
          {!d.events.length && (
            <p>No received interruption reports. This does not prove uninterrupted attendance.</p>
          )}
          <ul>
            {d.events.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                {e.kind.replaceAll('_', ' ')} · browser reported {e.observedAt} · received{' '}
                {e.receivedAt} · generation {e.deviceGeneration}
              </li>
            ))}
          </ul>
          <h3 className="font-semibold">Recent administrator decisions</h3>
          <ul>
            {d.history.map((h) => (
              <li key={h.revision} className="py-2 text-sm">
                {h.action} · {h.reason} · {h.at} · administrator {h.actorId}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
