import { useState } from 'react';
import { RefreshControl } from '@/components/shared/RefreshControl';
import { InterruptionRecord } from './InterruptionRecord';
import { formatEatDateTime } from '@/lib/ethiopian-date';
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
      <p className="text-sm text-muted-foreground">
        Checks for updates every 15 seconds while this page is visible. Reports may arrive late
        after a connection interruption. Device-reported times can be inaccurate; a report does not
        identify a screenshot or prove misconduct.
      </p>
      {query.error && (
        <p role="alert">
          Supervision could not be refreshed. Previously shown information may be out of date.{' '}
          {query.error.message}
        </p>
      )}
      <RefreshControl
        label="Refresh supervision"
        busy={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => query.refetch()}
      />
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
              <InterruptionRecord key={e.id} event={e} />
            ))}
          </ul>
          <h3 className="font-semibold">Recent administrator decisions</h3>
          <ul>
            {d.history.map((h) => (
              <li key={h.revision} className="py-2 text-sm">
                {h.action === 'suspend' ? 'Exam suspended' : 'Resuming approved'} · {h.reason} ·{' '}
                {formatEatDateTime(h.at, true)} · administrator {h.actorId}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
