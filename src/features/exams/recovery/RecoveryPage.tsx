import { RefreshControl } from '@/components/shared/RefreshControl';
import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { control, Failure, panel, useTeacherScope } from '../authoring/TeacherPage';
import { recoveryApi } from './api';
import type { DecisionRequest, RecoveryDetail as Detail } from './schemas';

const eat = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: true,
  }).format(new Date(value)) + ' EAT';
const label = (status: Detail['status']) =>
  ({ recovery_pending: 'Pending review', accepted: 'Accepted', rejected: 'Rejected' })[status];

export function RecoveryPage() {
  const client = useApiClient();
  const navigate = useNavigate();
  const example = useMutation({
    mutationFn: async () => {
      if (!import.meta.env.DEV || import.meta.env.MODE !== 'demo')
        throw new Error('Development example unavailable.');
      const { loadRecoveryExample } = await import('./demo-api');
      return loadRecoveryExample(client);
    },
    onSuccess: (result) => {
      void navigate(`/admin/recovery/${encodeURIComponent(result.recoveryId)}`);
    },
  });
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const scope = useTeacherScope();
  const api = recoveryApi(useApiClient());
  const query = useInfiniteQuery({
    queryKey: ['recovery-list', ...scope, filter],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.list(filter, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Recovery review</h1>
      {import.meta.env.DEV && import.meta.env.MODE === 'demo' && (
        <section className={`${panel} space-y-3`}>
          <p>
            Development demo: load a clearly labeled synthetic late upload to test acceptance or
            rejection without waiting for a real interruption.
          </p>
          <Button variant="outline" disabled={example.isPending} onClick={() => example.mutate()}>
            {example.isPending ? 'Loading example…' : 'Load synthetic recovery example'}
          </Button>
          <Failure error={example.error} />
        </section>
      )}
      <p>
        Review retained late uploads before deciding whether they become official submissions.
        Receiving an upload does not mean it was accepted.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          Show uploads
          <select
            className={control}
            value={filter}
            onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : 'pending')}
          >
            <option value="pending">Pending review</option>
            <option value="all">All uploads and decisions</option>
          </select>
        </label>
        <RefreshControl
          label="Refresh uploads"
          busy={query.isFetching}
          updatedAt={query.dataUpdatedAt}
          refresh={() => query.refetch()}
        />
      </div>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading recovery uploads…</p>}
      {!query.isPending && !query.error && !rows.length && (
        <p className={panel}>
          {filter === 'pending'
            ? 'No uploads awaiting review.'
            : 'No recovery uploads have been received.'}
        </p>
      )}
      {rows.map((row) => (
        <article className={panel} key={row.recoveryId}>
          <h2 className="text-xl font-semibold">
            {row.studentName} · {row.loginId}
          </h2>
          <p className="mt-2">
            {row.title} · {row.className}
          </p>
          <p className="mt-2">Received: {eat(row.receivedAt)}</p>
          <p>{label(row.status)}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`/admin/recovery/${encodeURIComponent(row.recoveryId)}`}>Review upload</Link>
          </Button>
        </article>
      ))}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more uploads
        </Button>
      )}
    </div>
  );
}

function DecisionForm({ detail }: { detail: Detail }) {
  const api = recoveryApi(useApiClient());
  const cache = useQueryClient();
  const [decision, setDecision] = useState<DecisionRequest['decision'] | ''>('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const retained = useRef<{ payload: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (body: DecisionRequest) => {
      const payload = JSON.stringify(body);
      if (retained.current?.payload !== payload)
        retained.current = { payload, key: crypto.randomUUID() };
      return api.decide(detail.recoveryId, body, retained.current.key);
    },
    onSuccess: () => {
      void cache.invalidateQueries({
        predicate: (q) =>
          [
            'recovery-detail',
            'recovery-list',
            'result-detail',
            'result-report',
            'result-sessions',
          ].includes(String(q.queryKey[0])),
      });
    },
  });
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (decision && confirmed && reason.trim() && (decision === 'reject' || detail.canAccept))
          mutation.mutate({ decision, reason: reason.trim() });
      }}
    >
      <h2 className="text-xl font-semibold">Record your decision</h2>
      {!detail.canAccept && (
        <p role="status">
          Acceptance unavailable:{' '}
          {detail.acceptanceBlocker ?? 'Refresh the case to check its current state.'}
        </p>
      )}
      <label className="block">
        Decision
        <select
          className={control}
          value={decision}
          disabled={mutation.isPending || mutation.isSuccess}
          onChange={(e) => {
            setDecision(
              e.target.value === 'accept' ? 'accept' : e.target.value === 'reject' ? 'reject' : '',
            );
            setConfirmed(false);
          }}
        >
          <option value="">Choose a decision</option>
          <option value="accept" disabled={!detail.canAccept}>
            Accept this snapshot
          </option>
          <option value="reject">Reject this upload</option>
        </select>
      </label>
      {decision && (
        <p>
          {decision === 'accept'
            ? 'Acceptance creates a committed receipt and official result for these exact answers. Other pending uploads for this attempt will be rejected as superseded. Revised results still need publication approval.'
            : 'Rejection keeps this evidence and its audit history. It creates no receipt or score. Other pending uploads remain available for review.'}
        </p>
      )}
      <label className="block">
        Decision reason
        <textarea
          className={control}
          value={reason}
          maxLength={2000}
          disabled={mutation.isPending || mutation.isSuccess}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={mutation.isPending || mutation.isSuccess}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed the upload, timely saves, related cases and the consequences of this decision.
      </label>
      <Failure error={mutation.error} />
      {mutation.isSuccess && (
        <p role="status">
          Decision saved. Refresh the case if its updated history has not appeared.
        </p>
      )}
      <Button
        disabled={
          !decision ||
          !reason.trim() ||
          !confirmed ||
          mutation.isPending ||
          mutation.isSuccess ||
          (decision === 'accept' && !detail.canAccept)
        }
      >
        {mutation.isPending
          ? 'Saving decision…'
          : decision === 'accept'
            ? 'Confirm acceptance'
            : decision === 'reject'
              ? 'Confirm rejection'
              : 'Confirm decision'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Choose a decision, enter its reason and confirm your review to enable submission.
      </p>
    </form>
  );
}

export function RecoveryDetailPage() {
  const { recoveryId = '' } = useParams();
  const api = recoveryApi(useApiClient());
  const scope = useTeacherScope();
  const query = useQuery({
    queryKey: ['recovery-detail', ...scope, recoveryId],
    queryFn: ({ signal }) => api.get(recoveryId, signal),
    refetchInterval: 15000,
  });
  const detail = query.data;
  return (
    <div className="space-y-6">
      <Link to="/admin/recovery" className="underline">
        Back to recovery review
      </Link>
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-3xl font-semibold">Review retained answers</h1>
        <RefreshControl
          label="Refresh case"
          busy={query.isFetching}
          updatedAt={query.dataUpdatedAt}
          refresh={() => query.refetch()}
        />
      </div>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading evidence…</p>}
      {detail && (
        <>
          <section className={`${panel} space-y-3`}>
            <h2 className="text-xl font-semibold">
              {detail.studentName} · {detail.loginId}
            </h2>
            <p>
              {detail.title} · {detail.className}
            </p>
            <p className="font-semibold">{label(detail.status)}</p>
            <p>Student deadline: {eat(detail.deadlineAt)}</p>
            <p>Final acceptance boundary: {eat(detail.finalAcceptUntil)}</p>
            <p>Recovery received by server: {eat(detail.receivedAt)}</p>
            <p>Upload reason: {detail.reason}</p>
            <p>
              Latest timely server save:{' '}
              {detail.latestTimelySave.savedAt
                ? eat(detail.latestTimelySave.savedAt)
                : 'No timely save recorded'}
            </p>
            <p>
              Timely save sequence: {detail.latestTimelySave.highestAcceptedSeq} · Uploaded final
              sequence: {detail.snapshot.finalSeq}
            </p>
            <p>
              Uploaded device generation: {detail.snapshot.deviceGeneration} · Generation at upload:{' '}
              {detail.currentDeviceGeneration}
            </p>
            {detail.snapshot.deviceGeneration !== detail.currentDeviceGeneration && (
              <p className="rounded border p-3">
                This upload came from an older device generation. Review it as disputed evidence;
                this difference is not an automatic penalty.
              </p>
            )}
            <details>
              <summary className="cursor-pointer">Snapshot identity</summary>
              <p>
                Paper version {detail.snapshot.examVersion} · Schedule revision{' '}
                {detail.snapshot.scheduleRevision}
              </p>
              <p className="break-all text-sm">SHA-256: {detail.snapshotDigest}</p>
              <p className="break-all text-sm">
                Recovery: {detail.recoveryId} · Attempt: {detail.attemptId}
              </p>
            </details>
          </section>
          <section className={`${panel} space-y-4`}>
            <h2 className="text-xl font-semibold">Answer comparison</h2>
            <p>
              The uploaded snapshot is immutable. A missing timely save is different from an
              unanswered final question.
            </p>
            {detail.paper.items.map((item, index) => {
              const timely = detail.latestTimelySave.answers.find((a) => a.itemId === item.itemId);
              const final = detail.snapshot.answers.find((a) => a.itemId === item.itemId);
              const answer = (value: string | null | undefined) =>
                value === null
                  ? 'Unanswered'
                  : value === undefined
                    ? 'No record'
                    : `${value}: ${item.options.find((o) => o.id === value)?.text ?? 'Unknown option — contact support'}`;
              return (
                <article className="rounded-lg border p-4" key={item.itemId}>
                  <h3 className="font-semibold">
                    {index + 1}. {item.stem}
                  </h3>
                  <p className="mt-2 text-sm">{item.marks} marks</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <p>
                      <strong>Latest timely save</strong>
                      <span className="block">
                        {timely ? answer(timely.value) : 'No timely answer saved'}
                      </span>
                    </p>
                    <p>
                      <strong>Uploaded final answer</strong>
                      <span className="block">{answer(final?.value)}</span>
                    </p>
                  </div>
                </article>
              );
            })}
          </section>
          {detail.relatedUploads.length > 0 && (
            <section className={`${panel} space-y-3`}>
              <h2 className="text-xl font-semibold">Other uploads for this attempt</h2>
              {detail.relatedUploads.map((r) => (
                <p key={r.recoveryId}>
                  <Link
                    className="underline"
                    to={`/admin/recovery/${encodeURIComponent(r.recoveryId)}`}
                  >
                    {eat(r.receivedAt)} · {label(r.status)}
                  </Link>
                </p>
              ))}
            </section>
          )}
          {detail.decision ? (
            <section className={`${panel} space-y-3`}>
              <h2 className="text-xl font-semibold">Decision recorded</h2>
              <p>
                {detail.decision.decision === 'accept' ? 'Accepted' : 'Rejected'} by{' '}
                {detail.decision.decidedBy} at {eat(detail.decision.decidedAt)}
              </p>
              <p>Reason: {detail.decision.reason}</p>
              {detail.decision.resultRevision !== null && (
                <p>
                  Result revision {detail.decision.resultRevision} requires separate publication
                  approval.
                </p>
              )}
              <Button asChild variant="outline">
                <Link to={`/admin/results/${encodeURIComponent(detail.sessionId)}`}>
                  Review sitting results
                </Link>
              </Button>
            </section>
          ) : (
            <DecisionForm key={detail.recoveryId} detail={detail} />
          )}
        </>
      )}
    </div>
  );
}
