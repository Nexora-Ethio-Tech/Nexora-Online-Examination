import { formatEatDateTime } from '@/lib/ethiopian-date';
import { ScheduleCountdown } from '@/components/shared/ScheduleCountdown';
import { RefreshControl } from '@/components/shared/RefreshControl';
import { useState } from 'react';
import { examGroup, examGroups, studentGradeStatuses, type GradeStatus } from './exam-groups';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CalendarDays, ArrowRight, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { examApi } from './api';
import type { Exam } from './schemas';
export const eatTime = formatEatDateTime;
export function examStatus(exam: Exam) {
  const states = {
    preparing: 'Preparation started',
    active: 'Exam started',
    awaiting_upload: 'Submission needs attention',
    recovery_pending: 'School review pending',
    submitted: 'Submission recorded',
    invalidated: 'Exam access cancelled',
  };
  return exam.attemptState
    ? states[exam.attemptState]
    : {
        scheduled: 'Scheduled',
        preparing: 'Preparation open',
        open: 'Exam open',
        ended: 'Exam ended',
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
  const [filter, setFilter] = useState<'All exams' | (typeof examGroups)[number]>('All exams');
  const [gradeFilter, setGradeFilter] = useState<'All past exams' | GradeStatus>('All past exams');
  const hasPast = exams.some((exam) => examGroup(exam) === 'Past exams');
  const grades = useQuery({
    queryKey: ['exam-grade-statuses', session?.school.id, session?.user.id],
    queryFn: ({ signal }) => studentGradeStatuses(client, signal),
    enabled: hasPast,
    refetchInterval: 30_000,
  });
  const gradeStatus = (exam: Exam) =>
    grades.data && !grades.isError
      ? (grades.data[exam.sessionId] ?? 'Awaiting results')
      : undefined;
  const groups = examGroups
    .map((title) => ({
      title,
      items: exams.filter(
        (exam) =>
          examGroup(exam) === title &&
          (title !== 'Past exams' ||
            gradeFilter === 'All past exams' ||
            !grades.data ||
            grades.isError ||
            gradeStatus(exam) === gradeFilter),
      ),
    }))
    .filter((group) => (filter === 'All exams' || filter === group.title) && group.items.length);
  return (
    <div className="space-y-6">
      <div className="page-intro">
        <p className="mb-2 text-sm text-muted-foreground">Welcome, {session?.user.displayName}</p>
        <h1 className="text-3xl font-semibold tracking-tight">My exams</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          All times in East Africa Time (EAT).
        </p>
      </div>
      <div className="text-sm leading-relaxed text-muted-foreground">
        Preparation opens at the time set by your school, before the common start. Keep this browser
        connected to prepare your paper. Joining late does not extend your deadline.
      </div>
      <RefreshControl
        label="Refresh exams"
        busy={query.isFetching || grades.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={async () => {
          const refreshed = await Promise.all([
            query.refetch(),
            ...(hasPast ? [grades.refetch()] : []),
          ]);
          return { error: refreshed.find((result) => result.error)?.error ?? null };
        }}
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
        <div className="nexora-surface rounded-xl border bg-background p-8">
          <h2 className="text-lg font-semibold">No exams assigned yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your school’s scheduled papers will appear here.
          </p>
        </div>
      ) : null}
      {!!exams.length && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter exams">
            {(['All exams', ...examGroups] as const).map((name) => (
              <Button
                key={name}
                variant={filter === name ? 'default' : 'outline'}
                aria-pressed={filter === name}
                onClick={() => {
                  setFilter(name);
                  setGradeFilter('All past exams');
                }}
              >
                {name}
              </Button>
            ))}
          </div>
          {(filter === 'Past exams' || filter === 'All exams') && hasPast && (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter past exam results"
            >
              {(['All past exams', 'Graded', 'Awaiting results', 'No grade'] as const).map(
                (name) => (
                  <Button
                    key={name}
                    variant={gradeFilter === name ? 'default' : 'outline'}
                    aria-pressed={gradeFilter === name}
                    disabled={name !== 'All past exams' && (!grades.data || grades.isError)}
                    onClick={() => {
                      setFilter('Past exams');
                      setGradeFilter(name);
                    }}
                  >
                    {name}
                  </Button>
                ),
              )}
            </div>
          )}
          {hasPast && (
            <p className="text-xs text-muted-foreground">
              Graded means your school has published your mark. Awaiting results does not mean your
              paper has not been marked.
            </p>
          )}
          {grades.isFetching && hasPast && <p role="status">Checking published results…</p>}
          {grades.error && (
            <p role="alert">
              Result status could not be checked. Use Refresh exams to retry; your exams are still
              listed.
            </p>
          )}
          {query.hasNextPage && (
            <p className="text-xs text-muted-foreground">
              Filters apply to loaded exams. Use Load more exams to include older or later sittings.
            </p>
          )}
          {!groups.length && <p role="status">No loaded exams match this filter.</p>}
        </div>
      )}
      {groups.map((group) => (
        <section key={group.title} className="space-y-4" aria-label={group.title}>
          <h2 className="text-xl font-semibold">{group.title}</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {group.items.map((exam) => (
              <article
                key={exam.sessionId}
                className="nexora-surface rounded-xl border bg-background p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {exam.subjectName} · {exam.className}
                  </span>
                  <span
                    className={
                      exam.attemptState === 'submitted'
                        ? 'inline-flex items-center gap-2 py-1 text-xs font-medium text-primary'
                        : 'py-1 text-xs font-medium'
                    }
                  >
                    {exam.attemptState === 'submitted' && (
                      <CircleCheck className="size-4" aria-hidden="true" />
                    )}
                    {examStatus(exam)}
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold">{exam.title}</h3>
                <p className="mt-3 flex items-start gap-2 text-sm">
                  <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                  {eatTime(exam.startsAt)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {exam.durationMinutes} minutes · Your deadline: {eatTime(exam.deadlineAt)}
                </p>
                {examGroup(exam) === 'Past exams' && (
                  <p className="mt-2 text-sm font-medium">
                    {gradeStatus(exam) ?? 'Result status not confirmed'}
                  </p>
                )}
                {examGroup(exam) !== 'Past exams' && (
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
                          ? 'exam starts'
                          : 'your deadline'
                    }
                  />
                )}
                <Button asChild variant="outline" className="mt-5 min-h-11">
                  <Link to={`/student/exams/${encodeURIComponent(exam.sessionId)}`}>
                    View schedule and preparation
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                {examGroup(exam) === 'Past exams' && gradeStatus(exam) === 'Graded' && (
                  <Button asChild variant="ghost" className="mt-2">
                    <Link to="/student/results">View results</Link>
                  </Button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
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
