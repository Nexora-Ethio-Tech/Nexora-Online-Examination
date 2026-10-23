import { schoolApi } from '@/features/school/api';
import { formatEatDateTime } from '@/lib/ethiopian-date';
import { useEffect, useState } from 'react';
import { EthiopianDateTimeField } from '@/components/shared/EthiopianDateTimeField';
import { parseEatInput } from '@/lib/ethiopian-date';
import { ExamBadge } from '@/components/shared/ExamBadge';
import { RefreshControl } from '@/components/shared/RefreshControl';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { Failure, panel, useTeacherScope } from '../authoring/TeacherPage';
import { adminExamApi } from './api';

export function AdminExamsPage() {
  const client = useApiClient();
  const api = adminExamApi(client);
  const scope = useTeacherScope();
  const [filters, setFilters] = useState({
    grade: '',
    classId: '',
    teacher: '',
    subject: '',
    search: '',
  });
  const [status, setStatus] = useState('in_review');
  const [settledFilters, setSettledFilters] = useState(filters);
  useEffect(() => {
    const timer = setTimeout(() => setSettledFilters(filters), 250);
    return () => clearTimeout(timer);
  }, [filters]);
  const classes = useQuery({
    queryKey: ['exam-filter-classes', ...scope],
    queryFn: async ({ signal }) => {
      let page = await schoolApi(client).classes(null, signal);
      const items = [...page.items];
      const seen = new Set<string>();
      while (page.nextCursor) {
        if (seen.has(page.nextCursor)) throw new Error('Class list could not finish loading.');
        seen.add(page.nextCursor);
        page = await schoolApi(client).classes(page.nextCursor, signal);
        items.push(...page.items);
      }
      return items;
    },
  });
  const grades = [...new Set((classes.data ?? []).map((c) => c.grade ?? 'unclassified'))].sort(
    (a, b) => a.localeCompare(b, 'en', { numeric: true }),
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const requestFilters = {
    ...settledFilters,
    status,
    from: from ? (parseEatInput(from) ?? '') : '',
    to: to ? (parseEatInput(to) ?? '') : '',
  };
  const query = useInfiniteQuery({
    queryKey: ['admin-exams', ...scope, requestFilters],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.list(pageParam, signal, requestFilters),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-6">
      <div className="page-intro flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">School administration</p>
          <h1 className="mt-2 text-3xl font-semibold">Exam approvals and schedules</h1>
        </div>
        <RefreshControl
          label="Refresh papers"
          busy={query.isFetching}
          updatedAt={query.dataUpdatedAt}
          refresh={() => query.refetch()}
        />
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Approval views">
        {[
          ['in_review', 'Pending approval'],
          ['approved', 'Approved & scheduled'],
          ['returned', 'Returned'],
        ].map(([value, label]) => (
          <Button
            key={value}
            aria-pressed={status === value}
            variant={status === value ? 'default' : 'outline'}
            onClick={() => value && setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {status === 'in_review'
          ? 'Oldest submission first across all grades. Resubmitted papers use their latest submission time.'
          : 'Browse by grade. Newest created papers appear first within each grade.'}
      </p>
      <section className={`${panel} grid gap-4 sm:grid-cols-2`} aria-label="Exam filters">
        {(['search', 'subject', 'teacher'] as const).map((key) => (
          <label key={key} className="block capitalize">
            {key === 'search' ? 'Search exams' : `Filter ${key}`}
            <input
              className="mt-2 min-h-11 w-full rounded border bg-background p-2"
              value={filters[key]}
              onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
              placeholder={key === 'search' ? 'Exam, subject name/code, teacher or class' : ''}
            />
          </label>
        ))}
        <label>
          Grade
          <select
            aria-label="Filter grade"
            className="mt-2 min-h-11 w-full rounded border p-2"
            value={filters.grade}
            onChange={(e) => setFilters({ ...filters, grade: e.target.value, classId: '' })}
          >
            <option value="">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g === 'unclassified' ? 'Grade not assigned' : 'Grade ' + g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class / section
          <select
            aria-label="Filter class"
            className="mt-2 min-h-11 w-full rounded border p-2"
            value={filters.classId}
            onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
          >
            <option value="">All classes</option>
            {(classes.data ?? [])
              .filter((c) => !filters.grade || (c.grade ?? 'unclassified') === filters.grade)
              .map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        {classes.isPending && <p role="status">Loading grade and class filters…</p>}
        <Failure error={classes.error} />
        {classes.error && (
          <Button onClick={() => void classes.refetch()}>Retry class filters</Button>
        )}
        <EthiopianDateTimeField label="Submitted from" value={from} onChange={setFrom} optional />
        <EthiopianDateTimeField label="Submitted until" value={to} onChange={setTo} optional />
        <Button
          variant="outline"
          onClick={() => {
            setFilters({ grade: '', classId: '', teacher: '', subject: '', search: '' });
            setFrom('');
            setTo('');
          }}
        >
          Clear filters
        </Button>
      </section>
      {query.isPending && <p role="status">Loading school papers…</p>}
      <Failure error={query.error} />
      {!query.isPending && !query.error && !rows.length && (
        <section className={panel}>
          <h2 className="text-lg font-semibold">No papers match this view</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A teacher must confirm and submit a paper before you can approve it. If you used
            filters, try clearing them.
          </p>
        </section>
      )}
      {(status === 'in_review'
        ? ['queue']
        : [...new Set(rows.map((row) => row.grade ?? 'unclassified'))]
      )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((grade) => (
          <section key={grade} className="space-y-3">
            <h2 className="text-xl font-semibold">
              {grade === 'queue'
                ? 'Waiting for review'
                : grade === 'unclassified'
                  ? 'Grade not assigned'
                  : `Grade ${grade}`}
            </h2>
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {rows
                .filter((row) => grade === 'queue' || (row.grade ?? 'unclassified') === grade)
                .map((row) => (
                  <article className={panel} key={row.exam.examId}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="text-xl font-semibold">{row.exam.title}</h2>
                      <ExamBadge status={row.exam.status} />
                    </div>
                    <p className="mt-3 text-sm">
                      {row.teacherName} · {row.className} · {row.subjectName}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {row.exam.itemCount} questions · {row.exam.totalMarks} marks ·{' '}
                      {row.exam.durationMinutes} minutes
                    </p>
                    <p className="mt-2 text-sm">
                      {row.submittedAt
                        ? 'Submitted ' + formatEatDateTime(row.submittedAt)
                        : 'Submission time unavailable'}
                    </p>
                    {row.exam.assignmentId === null ? (
                      <p role="status" className="mt-4 text-sm text-destructive">
                        Legacy paper: teacher assignment missing. Recreate and review this paper
                        under a valid teacher assignment before approval or scheduling.
                      </p>
                    ) : (
                      <Button asChild variant="outline" className="mt-4 min-h-11">
                        <Link to={`/admin/exams/${row.exam.examId}`}>Review and schedule</Link>
                      </Button>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Load more papers
        </Button>
      )}
    </div>
  );
}
