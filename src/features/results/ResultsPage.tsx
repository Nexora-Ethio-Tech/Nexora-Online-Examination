import { RefreshControl } from '@/components/shared/RefreshControl';
import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { roleHome } from '@/features/auth/role-home';
import { eatTime } from '@/features/exams/ExamsPage';
import { parseEatInput, toEatInput } from '@/features/exams/admin/schemas';
import { control, Failure, panel, useTeacherScope } from '@/features/exams/authoring/TeacherPage';
import { useApiClient } from '@/lib/ApiProvider';
import { resultsApi } from './api';
import type { PublishRequest, Report, ResultRow } from './schemas';

const statusText = (status: ResultRow['status']) =>
  ({
    finalized: 'Finalized',
    absent: 'No attempt recorded',
    awaiting_upload: 'Awaiting final upload',
    recovery_pending: 'Recovery pending',
    invalidated: 'Invalidated',
    excluded: 'Excluded from this publication',
  })[status];
const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
const boundaryTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: true,
  }).format(new Date(iso)) + ' EAT';
function downloadCsv(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nexora-official-results.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ResultsPage() {
  const { session } = useAuth();
  const api = resultsApi(useApiClient());
  const scope = useTeacherScope();
  const student = session?.user.role === 'student';
  const staff = useInfiniteQuery({
    queryKey: ['result-sessions', ...scope],
    enabled: !student,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.sessions(pageParam, signal),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
  const mine = useInfiniteQuery({
    queryKey: ['my-results', ...scope],
    enabled: student,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.mine(pageParam, signal),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
  const csv = useMutation({ mutationFn: () => api.csv(), onSuccess: downloadCsv });
  const query = student ? mine : staff;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Official results</h1>
      <p className="text-muted-foreground">
        {student
          ? 'Your official marks appear after administrator approval and the release time.'
          : session?.user.role === 'teacher'
            ? 'Results for your assigned classes and subjects. Publication is managed by your administrator.'
            : 'Review school results and approve each sitting for publication.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <RefreshControl
          label="Refresh results"
          busy={query.isFetching}
          updatedAt={query.dataUpdatedAt}
          refresh={() => query.refetch()}
        />
        {!student && (
          <Button
            variant="outline"
            disabled={csv.isPending || !staff.data?.pages.some((p) => p.items.length)}
            onClick={() => csv.mutate()}
          >
            {csv.isPending
              ? 'Preparing CSV…'
              : session?.user.role === 'teacher'
                ? 'Export all assigned results'
                : 'Export all school results'}
          </Button>
        )}
      </div>
      <Failure error={query.error ?? csv.error} />
      {query.isPending && <p role="status">Loading results…</p>}
      {!query.isPending && !query.error && !query.data?.pages.some((p) => p.items.length) && (
        <p className={panel}>
          No scheduled papers yet. Results for teacher-created, scheduled papers appear here.
        </p>
      )}
      {student
        ? mine.data?.pages
            .flatMap((p) => p.items)
            .map((row) => (
              <section className={panel} key={row.sessionId}>
                <h2 className="text-xl font-semibold">{row.title}</h2>
                <p className="mt-2">{row.className}</p>
                {row.result ? (
                  <>
                    <p className="mt-4 text-lg font-semibold">
                      {row.result.score === null
                        ? statusText(row.result.status)
                        : `${row.result.score} / ${row.result.maxScore} · ${percent(row.result.percent)}`}
                    </p>
                    {row.result.rank !== null && (
                      <p>
                        Class rank: {row.result.rank} ·{' '}
                        {row.result.passed ? 'Pass' : 'Below pass threshold'}
                      </p>
                    )}
                    {row.result.exclusionReason && (
                      <p className="mt-2">Reason: {row.result.exclusionReason}</p>
                    )}
                    <p className="mt-2 text-sm text-muted-foreground">
                      Published revision {row.publicationRevision}
                    </p>
                  </>
                ) : (
                  <p className="mt-4">
                    Not released. Planned release: {eatTime(row.plannedReleaseAt)}. Administrator
                    approval is also required.
                  </p>
                )}
                <p className="mt-4 text-sm text-muted-foreground">
                  Best practice score:{' '}
                  {row.bestPracticePercent === null
                    ? 'No completed practice score'
                    : percent(row.bestPracticePercent)}
                  . Practice is separate from your official result.
                </p>
                {row.practice?.available && (
                  <Button asChild variant="outline" className="mt-3">
                    <Link to="/student/practice">Open practice</Link>
                  </Button>
                )}
              </section>
            ))
        : staff.data?.pages
            .flatMap((p) => p.items)
            .map((row) => (
              <section className={panel} key={row.sessionId}>
                <h2 className="text-xl font-semibold">{row.title}</h2>
                <p className="mt-2">
                  {row.className} · {row.subjectName}
                </p>
                <p className="mt-2">Exam ends: {eatTime(row.endsAt)}</p>
                <p className="mt-2">
                  {row.publication?.revision === row.revision
                    ? `Approved revision ${row.revision} · release ${eatTime(row.publication.releaseAt)}`
                    : `Revision ${row.revision} needs publication approval`}
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link
                    to={`${roleHome[session?.user.role ?? 'student']}/results/${encodeURIComponent(row.sessionId)}`}
                  >
                    View results
                  </Link>
                </Button>
              </section>
            ))}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more results
        </Button>
      )}
    </div>
  );
}

function PublicationForm({ report }: { report: Report }) {
  const api = resultsApi(useApiClient());
  const cache = useQueryClient();
  const [release, setRelease] = useState(toEatInput(report.summary.plannedReleaseAt));
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [exclusions, setExclusions] = useState<Record<string, string>>({});
  const retained = useRef<{ payload: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (body: PublishRequest) => {
      const payload = JSON.stringify(body);
      if (retained.current?.payload !== payload)
        retained.current = { payload, key: crypto.randomUUID() };
      return api.publish(report.summary.sessionId, body, retained.current.key);
    },
    onSuccess: () => {
      void cache.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'result-detail' ||
          q.queryKey[0] === 'result-report' ||
          q.queryKey[0] === 'result-sessions',
      });
    },
  });
  const pending = report.rows.filter(
    (r) => r.status === 'awaiting_upload' || r.status === 'recovery_pending',
  );
  const releaseAt = parseEatInput(release);
  const closed = Date.parse(report.serverNow) > Date.parse(report.summary.publishableAfter);
  const valid =
    closed &&
    confirmed &&
    reason.trim() &&
    releaseAt &&
    Date.parse(releaseAt) >= Date.parse(report.summary.publishableAfter) &&
    pending.every((r) => r.attemptId && exclusions[r.attemptId]?.trim());
  if (report.summary.publication?.revision === report.summary.revision)
    return (
      <section className={`${panel} print:hidden`}>
        <h2 className="text-xl font-semibold">Publication approved</h2>
        <p className="mt-2">
          Revision {report.summary.revision} becomes visible at{' '}
          {eatTime(report.summary.publication.releaseAt)}.
        </p>
        <p className="mt-2">
          Approved by {report.summary.publication.approvedBy}: {report.summary.publication.reason}
        </p>
      </section>
    );
  return (
    <form
      className={`${panel} space-y-4 print:hidden`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && releaseAt)
          mutation.mutate({
            revision: report.summary.revision,
            releaseAt,
            reason: reason.trim(),
            exclusions: pending.map((r) => ({
              attemptId: r.attemptId ?? '',
              reason: exclusions[r.attemptId ?? '']?.trim() ?? '',
            })),
          });
      }}
    >
      <h2 className="text-xl font-semibold">Approve result publication</h2>
      <p>Students cannot see this revision until you approve it and its release time arrives.</p>
      {!closed && (
        <p role="status">
          Publication is available after {boundaryTime(report.summary.publishableAfter)}, when all
          submission windows have closed.
        </p>
      )}
      <label className="block">
        Results release date and time (EAT)
        <input
          type="datetime-local"
          className={control}
          value={release}
          disabled={mutation.isPending}
          onChange={(e) => setRelease(e.target.value)}
        />
      </label>
      {(!releaseAt || Date.parse(releaseAt) < Date.parse(report.summary.publishableAfter)) && (
        <p className="text-destructive">
          Choose a valid release time after all submission windows close.
        </p>
      )}
      <label className="block">
        Publication reason
        <textarea
          className={control}
          maxLength={2000}
          value={reason}
          disabled={mutation.isPending}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain your review and decision."
        />
      </label>
      {pending.length > 0 && (
        <p>
          These attempts are unresolved. Resolve them through{' '}
          <Link className="underline" to="/admin/recovery">
            recovery review
          </Link>
          , or explicitly exclude each from this publication. Exclusion does not reject or delete
          the retained upload.
        </p>
      )}
      {pending.map((row) => (
        <label className="block" key={row.studentId}>
          Exclusion reason for {row.studentName} ({statusText(row.status)})
          <textarea
            className={control}
            maxLength={2000}
            disabled={mutation.isPending}
            value={exclusions[row.attemptId ?? ''] ?? ''}
            onChange={(e) =>
              setExclusions({ ...exclusions, [row.attemptId ?? '']: e.target.value })
            }
          />
        </label>
      ))}
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={mutation.isPending}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed the marks, ranks, exclusions and release time for revision{' '}
        {report.summary.revision}.
      </label>
      <Failure error={mutation.error} />
      {mutation.isSuccess && <p role="status">Publication approval saved.</p>}
      <Button disabled={!valid || mutation.isPending}>
        {mutation.isPending ? 'Saving approval…' : 'Approve publication'}
      </Button>
      {!confirmed && (
        <p className="text-sm text-muted-foreground">
          Complete the reason and review confirmation to enable approval.
        </p>
      )}
    </form>
  );
}

export function ReportView({ report }: { report: Report }) {
  return (
    <div className="results-print grid gap-6 xl:grid-cols-2">
      <dl className="grid gap-4 border-y py-5 sm:grid-cols-3 xl:col-span-2">
        {[
          ['Finalized results', report.analytics.includedCount],
          ['Status rows', report.analytics.statusCount],
          ['Topics assessed', report.analytics.topics.length],
        ].map(([label, value]) => (
          <div className="px-1" key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-2 font-heading text-4xl">{value}</dd>
          </div>
        ))}
      </dl>
      <section className={`${panel} xl:col-span-2`}>
        <h2 className="text-2xl font-semibold">{report.summary.title}</h2>
        <p>
          {report.summary.className} · {report.summary.subjectName}
        </p>
        <p>
          Official result revision {report.summary.revision} ·{' '}
          {report.summary.publication?.revision === report.summary.revision
            ? `Approved; release ${eatTime(report.summary.publication.releaseAt)}`
            : 'Unpublished revision — staff review only'}
        </p>
        <p className="mt-2">
          {report.analytics.includedCount} finalized results · {report.analytics.statusCount} status
          rows
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ranks use competition ranking within this sitting and class (1, 2, 2, 4). Status rows have
          no score or rank.
        </p>
        <div
          className="mt-4 overflow-x-auto rounded focus-visible:outline-2 focus-visible:outline-primary"
          role="region"
          aria-label="Scrollable official marks and class ranks"
          tabIndex={0}
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Official marks and class ranks</caption>
            <thead>
              <tr>
                {['Student', 'Status', 'Mark', 'Percent', 'Rank'].map((h) => (
                  <th className="p-2" key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr className="border-t" key={row.studentId}>
                  <th scope="row" className="p-2 font-normal">
                    {row.studentName}
                    <span className="block text-xs">{row.loginId}</span>
                  </th>
                  <td className="p-2">
                    {statusText(row.status)}
                    {row.exclusionReason && (
                      <span className="block text-xs">{row.exclusionReason}</span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {row.score === null ? '—' : `${row.score} / ${row.maxScore}`}
                  </td>
                  <td className="p-2">{percent(row.percent)}</td>
                  <td className="p-2">{row.rank ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Score distribution</h2>
        <p className="mb-4 text-sm">Finalized official results only.</p>
        {report.analytics.includedCount === 0 ? (
          <p>No finalized official results to chart yet.</p>
        ) : (
          <>
            <div
              className="overflow-x-auto"
              role="img"
              aria-label="Score distribution column chart. Exact student counts are in the table below."
            >
              <div className="flex h-56 min-w-72 items-end gap-3 border-b px-2" aria-hidden="true">
                {report.analytics.distribution.map((bin) => (
                  <div
                    key={bin.label}
                    className="flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-sm font-semibold">{bin.count}</span>
                    <div
                      className="w-full max-w-20 rounded-t-lg bg-primary"
                      style={{
                        height: `${(bin.count / Math.max(1, ...report.analytics.distribution.map((value) => value.count))) * 75}%`,
                      }}
                    />
                    <span className="min-h-10 text-center text-xs">{bin.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <table className="mt-4 w-full text-left text-sm">
              <caption className="text-left font-medium">Students by score range</caption>
              <thead>
                <tr>
                  <th className="py-2">Score range</th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {report.analytics.distribution.map((bin) => (
                  <tr key={bin.label} className="border-t">
                    <th className="py-2 font-normal">{bin.label}</th>
                    <td>{bin.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Primary-topic performance</h2>
        <p className="mb-4 text-sm">
          Unanswered questions count toward available marks. Secondary topics and practice scores do
          not enter this chart.
        </p>
        {!report.analytics.topics.length && <p>No topic results to chart yet.</p>}
        {report.analytics.topics.map((topic) => (
          <div className="mb-4" key={topic.topic}>
            <p className="font-medium">
              {topic.topic}: {percent(topic.percent)}
            </p>
            <p className="text-sm">
              {topic.earnedMarks} / {topic.availableMarks} marks · {topic.itemCount} questions ·{' '}
              {topic.studentCount} students
            </p>
            <div className="mt-2 h-3 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
              <div
                className="h-3 rounded-sm bg-primary"
                style={{ width: `${topic.percent ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function ResultDetail() {
  const { sessionId = '' } = useParams();
  const { session } = useAuth();
  const api = resultsApi(useApiClient());
  const scope = useTeacherScope();
  const detail = useQuery({
    queryKey: ['result-detail', ...scope, sessionId],
    queryFn: ({ signal }) => api.results(sessionId, null, signal),
    refetchInterval: 15000,
  });
  const revision = detail.data?.summary.revision;
  const report = useQuery({
    queryKey: ['result-report', ...scope, sessionId, revision],
    enabled: revision !== undefined,
    queryFn: ({ signal }) => api.report(sessionId, revision ?? 1, signal),
    refetchInterval: 15000,
  });
  const csv = useMutation({
    mutationFn: () => api.csv(sessionId, revision),
    onSuccess: downloadCsv,
  });
  // Request-time clock and publication metadata come from the fresh detail read.
  const data =
    report.data && detail.data && report.data.summary.revision === detail.data.summary.revision
      ? { ...report.data, summary: detail.data.summary, serverNow: detail.data.serverNow }
      : null;
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          className="underline"
          to={`${roleHome[session?.user.role ?? 'school_admin']}/results`}
        >
          Back to results
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">Marks and publication</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <RefreshControl
            label="Refresh results"
            busy={detail.isFetching || report.isFetching}
            updatedAt={Math.min(detail.dataUpdatedAt, report.dataUpdatedAt)}
            refresh={async () => {
              const [latest, summary] = await Promise.all([detail.refetch(), report.refetch()]);
              return { error: latest.error || summary.error };
            }}
          />
          <Button variant="outline" disabled={!data || csv.isPending} onClick={() => csv.mutate()}>
            Download sitting CSV
          </Button>
          <Button variant="outline" disabled={!data} onClick={() => window.print()}>
            Print report / Save as PDF
          </Button>
        </div>
      </div>
      <Failure error={detail.error ?? report.error ?? csv.error} />
      {(detail.isPending || (revision !== undefined && report.isPending)) && (
        <p role="status">Loading official results…</p>
      )}
      {data && (
        <>
          {session?.user.role === 'school_admin' && (
            <PublicationForm
              key={`${sessionId}:${data.summary.revision}:${data.summary.publication?.revision ?? ''}`}
              report={data}
            />
          )}
          <p className="text-sm text-muted-foreground">{session?.school.name}</p>
          <ReportView report={data} />
        </>
      )}
    </div>
  );
}
