import { ScheduleCountdown } from '@/components/shared/ScheduleCountdown';
import { RefreshControl } from '@/components/shared/RefreshControl';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CalendarDays, ArrowRight, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { examApi } from './api';
import type { Exam } from './schemas';
export const eatTime = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value)) + ' EAT';
export function examStatus(exam: Exam) {
  const states = {
    preparing: 'Preparation started',
    active: 'Attempt in progress',
    awaiting_upload: 'Upload unresolved',
    recovery_pending: 'School review pending',
    submitted: 'Submission recorded',
    invalidated: 'Attempt invalidated',
  };
  return exam.attemptState
    ? states[exam.attemptState]
    : {
        scheduled: 'Scheduled',
        preparing: 'Preparation open',
        open: 'Exam window open',
        ended: 'Exam window ended',
      }[exam.phase];
}
export function ExamsPage() {
  const client = useApiClient();
  const { session } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ['exams', session?.school.id, session?.user.id],
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) => {
      const data = await examApi(client).list(pageParam, signal);
      return {
        ...data,
        clock: { epoch: Date.parse(data.serverNow), receivedAt: performance.now() },
      };
    },
    getNextPageParam: (page): string | null | undefined => page.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const exams =
    query.data?.pages.flatMap((page) =>
      page.items.map((item) => ({ ...item, clock: page.clock })),
    ) ?? [];
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Your school workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">My exams</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your assigned papers and preparation times. All times are East Africa Time (EAT).
        </p>
      </div>
      <div className="rounded-xl border bg-primary/5 p-5 text-sm leading-relaxed">
        Preparation opens 10 minutes before the common start. Keep this browser connected to prepare
        your paper. Joining late does not extend your deadline.
      </div>
      <RefreshControl
        label="Refresh exams"
        busy={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => query.refetch()}
      />
      {query.isPending ? <p role="status">Loading your exams…</p> : null}
      {query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {!query.isPending && !query.error && exams.length === 0 ? (
        <div className="rounded-xl border bg-background p-8">
          <h2 className="text-lg font-semibold">No exams assigned yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your school’s scheduled papers will appear here.
          </p>
        </div>
      ) : null}
      <div className="space-y-4">
        {exams.map((exam) => (
          <article key={exam.sessionId} className="rounded-xl border bg-background p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {exam.subjectName} · {exam.className}
              </span>
              <span
                className={
                  exam.attemptState === 'submitted'
                    ? 'inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-950'
                    : 'rounded-full bg-muted px-3 py-1 text-xs font-medium'
                }
              >
                {exam.attemptState === 'submitted' && (
                  <CircleCheck className="size-4" aria-hidden="true" />
                )}
                {examStatus(exam)}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold">{exam.title}</h2>
            <p className="mt-3 flex items-start gap-2 text-sm">
              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              {eatTime(exam.startsAt)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {exam.durationMinutes} minutes · Your deadline: {eatTime(exam.deadlineAt)}
            </p>
            <ScheduleCountdown
              sample={exam.clock}
              target={
                exam.phase === 'scheduled'
                  ? exam.preparationVisibleAt
                  : exam.phase === 'preparing'
                    ? exam.startsAt
                    : exam.deadlineAt
              }
              label={
                exam.phase === 'scheduled'
                  ? 'preparation'
                  : exam.phase === 'preparing'
                    ? 'common start'
                    : 'your deadline'
              }
            />
            <Button asChild variant="outline" className="mt-5 min-h-11">
              <Link to={`/student/exams/${encodeURIComponent(exam.sessionId)}`}>
                View schedule and preparation
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </article>
        ))}
      </div>
      {query.hasNextPage ? (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more exams'}
        </Button>
      ) : null}
    </div>
  );
}
