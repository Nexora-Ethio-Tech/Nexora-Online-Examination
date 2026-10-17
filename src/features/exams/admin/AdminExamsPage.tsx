import { RefreshControl } from '@/components/shared/RefreshControl';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { Failure, panel, useTeacherScope } from '../authoring/TeacherPage';
import { adminExamApi } from './api';

export function AdminExamsPage() {
  const api = adminExamApi(useApiClient());
  const scope = useTeacherScope();
  const query = useInfiniteQuery({
    queryKey: ['admin-exams', ...scope],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.list(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">School administration</p>
          <h1 className="mt-2 text-3xl font-semibold">Exam approvals and schedules</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Review teacher submissions, approve a frozen paper, then schedule its class sitting.
          </p>
        </div>
        <RefreshControl
          label="Refresh papers"
          busy={query.isFetching}
          updatedAt={query.dataUpdatedAt}
          refresh={() => query.refetch()}
        />
      </div>
      {query.isPending && <p role="status">Loading school papers…</p>}
      <Failure error={query.error} />
      {!query.isPending && !query.error && !rows.length && (
        <section className={panel}>
          <h2 className="text-lg font-semibold">No papers submitted yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A teacher must review and submit a paper before you can approve it. In the demo, sign
            out and sign in as the teacher in this same tab; avoid reloading so the demo retains
            your work.
          </p>
        </section>
      )}
      {rows.map((row) => (
        <article className={panel} key={row.exam.examId}>
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-xl font-semibold">{row.exam.title}</h2>
            <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">
              {row.exam.status.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-3 text-sm">
            {row.teacherName} · {row.className} · {row.subjectName}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {row.exam.itemCount} questions · {row.exam.totalMarks} marks ·{' '}
            {row.exam.durationMinutes} minutes
          </p>
          <Button asChild variant="outline" className="mt-4 min-h-11">
            <Link to={`/admin/exams/${row.exam.examId}`}>Review and schedule</Link>
          </Button>
        </article>
      ))}
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Load more papers
        </Button>
      )}
    </div>
  );
}
