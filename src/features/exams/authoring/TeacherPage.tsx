import { usePagedQuery } from '@/components/shared/Pagination';
import { EditDialog } from '@/components/shared/EditDialog';
import { directoryCache } from '@/lib/query-policy';
import { formatEatDateTime } from '@/lib/ethiopian-date';
import { ExamBadge } from '@/components/shared/ExamBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiClient } from '@/lib/ApiProvider';
import { ApiError, errorMessage, isConnectionError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/AuthProvider';
import { authoringApi } from './api';
import { metadataSchema, type Metadata, type Assignment } from './schemas';

export const control = 'min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm';
export const panel = 'nexora-surface rounded-xl border bg-background p-5 sm:p-6';
export function useTeacherScope() {
  const { session } = useAuth();
  const schoolId = session?.school.id;
  const userId = session?.user.id;
  return useMemo(() => [schoolId, userId], [schoolId, userId]);
}
export function Failure({ error, action = false }: { error: unknown; action?: boolean }) {
  return error && (action || !isConnectionError(error)) ? (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
    >
      {errorMessage(error)}
      {error instanceof ApiError &&
        error.details.map((detail, index) => (
          <p key={index} className="mt-1">
            {detail.path}: {detail.message}
          </p>
        ))}
    </div>
  ) : null;
}
export function MetadataForm({
  initial,
  assignments,
  lockedContext = false,
  pending,
  disabled = false,
  onSave,
  onDirty,
}: {
  initial?: Metadata;
  assignments: Assignment[];
  lockedContext?: boolean;
  pending: boolean;
  disabled?: boolean;
  onSave: (data: Metadata) => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const form = useForm<Metadata>({
    resolver: zodResolver(metadataSchema),
    defaultValues: initial ?? {
      title: '',
      instructions: 'Choose one answer for each question.',
      assignmentId: '',
      language: 'en',
      durationMinutes: 60,
      passPercent: 50,
      ordering: 'fixed',
    },
  });
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirty?.(isDirty);
  }, [isDirty, onDirty]);
  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
      <fieldset disabled={pending || disabled} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 sm:col-span-2">
          <span className="field-label">Exam title</span>
          <Input required {...form.register('title')} />
        </label>
        <label className="space-y-2">
          <span className="field-label">Class and subject</span>
          <select
            required
            className={control}
            {...form.register('assignmentId')}
            disabled={lockedContext}
          >
            <option value="">Select your assignment</option>
            {assignments.map((a) => (
              <option key={a.assignmentId} value={a.assignmentId}>
                {a.className} · {a.subjectName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="field-label">Language</span>
          <select
            required
            className={control}
            {...form.register('language')}
            disabled={lockedContext}
          >
            <option value="en">English</option>
            <option value="am">Amharic</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="field-label">Duration in minutes</span>
          <Input
            required
            type="number"
            {...form.register('durationMinutes', { valueAsNumber: true })}
          />
        </label>
        <label className="space-y-2">
          <span className="field-label">Pass threshold (%)</span>
          <Input
            required
            type="number"
            step="0.1"
            {...form.register('passPercent', { valueAsNumber: true })}
          />
        </label>
        <label className="space-y-2 sm:col-span-2">
          <span className="field-label">Question ordering</span>
          <select required className={control} {...form.register('ordering')}>
            <option value="fixed">Keep template order</option>
            <option value="shuffle_questions_and_options">
              Shuffle questions and options per student
            </option>
          </select>
        </label>
        <label className="space-y-2 sm:col-span-2">
          <span className="field-label">Instructions</span>
          <textarea required rows={3} className={control} {...form.register('instructions')} />
        </label>
      </fieldset>
      {Object.entries(form.formState.errors).map(([field, error]) => (
        <p role="alert" key={field} className="text-sm text-destructive">
          {field}: {error.message}
        </p>
      ))}
      <Button disabled={pending || disabled || assignments.length === 0} className="min-h-11">
        {pending ? 'Saving…' : initial ? 'Save exam details' : 'Create draft'}
      </Button>
    </form>
  );
}
export function useAssignments() {
  const api = authoringApi(useApiClient());
  const scope = useTeacherScope();
  return useInfiniteQuery({
    ...directoryCache,
    queryKey: ['teaching-assignments', ...scope],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.assignments(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function TeacherPage() {
  const api = authoringApi(useApiClient());
  const scope = useTeacherScope();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [category, setCategory] = useState('active');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const retained = useRef<{ json: string; key: string } | null>(null);
  const assignments = useAssignments();
  const list = useInfiniteQuery({
    queryKey: ['teacher-exams', ...scope, category, status],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.list(pageParam, signal, category, status),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const pagination = usePagedQuery(list, JSON.stringify([scope, category, status]));
  const create = useMutation({
    mutationFn: (data: Metadata) => {
      const json = JSON.stringify(data);
      if (retained.current?.json !== json) retained.current = { json, key: crypto.randomUUID() };
      return api.create(data, retained.current.key);
    },
    onSuccess: (draft) => {
      void qc.invalidateQueries({ queryKey: ['teacher-exams', ...scope] });
      void navigate(`/teacher/exams/${draft.examId}`);
    },
  });
  return (
    <div className="space-y-6">
      <div className="page-intro flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-2 text-3xl font-semibold">My exam papers</h1>
        </div>
        <Button data-tour="new-exam" className="min-h-11" onClick={() => setCreating(!creating)}>
          {creating ? 'Close new draft' : 'New exam'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3" aria-label="Paper categories">
        {(['active', 'past'] as const).map((value) => (
          <Button
            key={value}
            variant={category === value ? 'default' : 'outline'}
            aria-pressed={category === value}
            onClick={() => {
              setCategory(value);
              setStatus('');
            }}
          >
            {value === 'active' ? 'Active & upcoming' : 'Past papers'}
          </Button>
        ))}
        {category === 'active' && (
          <label>
            <span className="field-label">Paper status </span>
            <select className={control} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="returned">Returned</option>
              <option value="in_review">Pending approval</option>
              <option value="approved">Approved</option>
            </select>
          </label>
        )}
        <p className="text-sm text-muted-foreground">
          Newest created first. Past papers have no remaining scheduled submission windows.
        </p>
      </div>
      {creating && (
        <EditDialog
          title="Create a paper"
          close={() => setCreating(false)}
          locked={create.isPending}
        >
          <h2 className="mb-5 text-xl font-semibold">Create an exam draft</h2>
          {assignments.isPending && <p role="status">Loading assignments…</p>}
          <Failure error={assignments.error} />
          {assignments.error && (
            <Button onClick={() => void assignments.refetch()}>Retry assignments</Button>
          )}
          {assignments.data && (
            <>
              <MetadataForm
                pending={create.isPending}
                assignments={assignments.data.pages.flatMap((p) => p.items)}
                onSave={(data) => create.mutate(data)}
              />
              {assignments.data.pages.every((p) => p.items.length === 0) && (
                <p className="mt-3 text-sm">
                  No teaching assignments. Ask your administrator to assign your class and subject.
                </p>
              )}
            </>
          )}
          {assignments.hasNextPage && (
            <Button onClick={() => void assignments.fetchNextPage()}>Load more assignments</Button>
          )}
          <Failure action error={create.error} />
        </EditDialog>
      )}
      {list.isPending && <p role="status">Loading exam papers…</p>}
      <Failure error={list.error} />
      {list.error && <Button onClick={() => void list.refetch()}>Retry exam list</Button>}
      {list.data?.pages.every((p) => p.items.length === 0) && (
        <section className={panel}>
          <h2 className="text-lg font-semibold">No papers match this view</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a draft, upload a question template or generate with AI when enabled, then review
            the explanations and answer keys.
          </p>
        </section>
      )}
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {pagination.page?.items.map((d) => (
          <article key={d.examId} className={panel}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="text-xl font-semibold">{d.title}</h2>
              <ExamBadge status={d.status} />
            </div>
            <p className="my-3 text-sm text-muted-foreground">
              {d.itemCount} questions · {d.totalMarks} marks · {d.reviewedCount} reviewed ·{' '}
              {d.durationMinutes} minutes
            </p>
            <p className="mb-3 text-sm text-muted-foreground">
              {d.createdAt
                ? 'Created ' + formatEatDateTime(d.createdAt)
                : 'Creation time unavailable'}
              {d.concluded ? ' · Exam sittings ended; results release separately' : ''}
            </p>
            <Button variant="outline" asChild>
              <Link to={`/teacher/exams/${d.examId}`}>Open paper</Link>
            </Button>
          </article>
        ))}
      </div>
      {pagination.controls}
    </div>
  );
}
