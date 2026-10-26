import { usePagedQuery } from '@/components/shared/Pagination';
import { ScheduleCountdown } from '@/components/shared/ScheduleCountdown';
import { RefreshControl } from '@/components/shared/RefreshControl';
import { useRef, useState } from 'react';
import { EthiopianDateTimeField } from '@/components/shared/EthiopianDateTimeField';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { control, Failure, panel, useTeacherScope } from '@/features/exams/authoring/TeacherPage';
import { parseEatInput, toEatInput } from '@/features/exams/admin/schemas';
import { eatTime } from '@/features/exams/ExamsPage';
import { practiceApi } from './api';
import type { PracticeAccess, PracticeAttempt, PracticeSettings } from './schemas';

function AccessForm({ access }: { access: PracticeAccess }) {
  const api = practiceApi(useApiClient());
  const cache = useQueryClient();
  const [enabled, setEnabled] = useState(access.enabled);
  const [release, setRelease] = useState(
    toEatInput(
      access.releaseAt ??
        new Date(Math.ceil(Date.parse(access.serverNow) / 60000) * 60000).toISOString(),
    ),
  );
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const retained = useRef<{ payload: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (body: PracticeSettings) => {
      const payload = JSON.stringify(body);
      if (retained.current?.payload !== payload)
        retained.current = { payload, key: crypto.randomUUID() };
      return api.settings(access.examId, body, retained.current.key);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['practice-admin'] });
    },
  });
  const releaseAt = parseEatInput(release);
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed && (!enabled || releaseAt))
          mutation.mutate({
            revision: access.revision,
            examVersion: access.examVersion,
            enabled,
            releaseAt,
            reason: reason.trim(),
          });
      }}
    >
      <h2 className="text-xl font-semibold">{access.title}</h2>
      <p>
        Approved paper version {access.examVersion} ·{' '}
        {access.available ? 'Practice available' : 'Practice locked'}
      </p>
      {access.blockers.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {access.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        Practice opens only after this switch, its release time, released official results for every
        related cohort and closure of all related submission windows.
      </p>
      {access.contentReleasedAt && (
        <p>
          Released for practice at {eatTime(access.contentReleasedAt)}. This paper can no longer be
          scheduled for another official sitting.
        </p>
      )}
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={mutation.isPending}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setConfirmed(false);
          }}
        />
        Enable practice
      </label>
      <EthiopianDateTimeField
        label="Practice release date and time (EAT)"
        value={release}
        disabled={mutation.isPending}
        onChange={(value) => {
          setRelease(value);
          setConfirmed(false);
        }}
      />
      {enabled && !releaseAt && (
        <p className="text-destructive">Enter a valid EAT release date and time.</p>
      )}
      <label className="block">
        <span className="field-label">Note (optional)</span>
        <textarea
          className={control}
          maxLength={2000}
          disabled={mutation.isPending}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={mutation.isPending}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I checked the paper, release time and practice access.
      </label>
      <Failure action error={mutation.error} />
      {mutation.isSuccess && <p role="status">Practice settings saved.</p>}
      <Button disabled={mutation.isPending || !confirmed || (enabled && !releaseAt)}>
        {mutation.isPending ? 'Saving…' : 'Save practice settings'}
      </Button>
      {access.history.length > 0 && (
        <details>
          <summary className="cursor-pointer">Settings history</summary>
          {access.history.map((h, index) => (
            <p className="mt-2 text-sm" key={index}>
              {eatTime(h.at)} · {h.actorName} · {h.enabled ? 'Enabled' : 'Disabled'} · {h.reason}
            </p>
          ))}
        </details>
      )}
    </form>
  );
}
export function AdminPracticePage() {
  const api = practiceApi(useApiClient());
  const scope = useTeacherScope();
  const query = useInfiniteQuery({
    queryKey: ['practice-admin', ...scope],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api.adminList(pageParam, signal),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
  const pagination = usePagedQuery(query, JSON.stringify(scope));
  const rows = pagination.page?.items ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Practice release</h1>
      <p>
        Set practice access for approved papers. Practice feedback never changes official marks or
        ranks. Disabling practice stops further practice access, but cannot retract explanations
        already seen.
      </p>
      <RefreshControl
        label="Refresh practice settings"
        busy={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => query.refetch()}
      />
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading approved papers…</p>}
      {!query.isPending && !query.error && !rows.length && (
        <p className={panel}>Approve a paper before configuring practice.</p>
      )}
      {rows.map((row) => (
        <AccessForm key={`${row.examId}:${row.revision}`} access={row} />
      ))}
      {pagination.controls}
    </div>
  );
}
function StartPractice({
  examId,
  examVersion,
  disabled,
}: {
  examId: string;
  examVersion: number;
  disabled: boolean;
}) {
  const api = practiceApi(useApiClient());
  const navigate = useNavigate();
  const key = useRef(crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: () => api.start(examId, examVersion, key.current),
    onSuccess: (a) => {
      void navigate(`/student/practice/${encodeURIComponent(a.practiceAttemptId)}`);
    },
  });
  return (
    <div>
      <Button disabled={disabled || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Starting…' : 'Start new practice'}
      </Button>
      <Failure action error={mutation.error} />
    </div>
  );
}
export function PracticePage() {
  const api = practiceApi(useApiClient());
  const scope = useTeacherScope();
  const query = useInfiniteQuery({
    queryKey: ['practice-list', ...scope],
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) => {
      const data = await api.mine(pageParam, signal);
      return {
        ...data,
        clock: { epoch: Date.parse(data.serverNow), receivedAt: performance.now() },
      };
    },
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
  const pagination = usePagedQuery(query, JSON.stringify(scope));
  const currentPage = pagination.page;
  const rows = currentPage?.items.map((item) => ({ ...item, clock: currentPage.clock })) ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Practice</h1>
      <p>
        Try released papers again. Only your first answer to each question counts in that practice
        attempt. Your best completed practice score stays separate from your official result.
      </p>
      <RefreshControl
        label="Refresh practice"
        busy={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => query.refetch()}
      />
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading practice papers…</p>}
      {!query.isPending && !query.error && !rows.length && (
        <p className={panel}>No practice papers have been assigned yet.</p>
      )}
      {rows.map((row) => (
        <section className={`${panel} space-y-3`} key={row.examId}>
          <h2 className="text-xl font-semibold">{row.title}</h2>
          <p>
            Best practice:{' '}
            {row.bestPercent === null ? 'No completed score yet' : `${row.bestPercent.toFixed(1)}%`}{' '}
            · {row.completedCount} completed attempts
          </p>
          {!row.available && (
            <ul className="list-disc pl-5">
              {row.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {row.releaseAt && (
            <>
              <p>Practice release: {eatTime(row.releaseAt)}</p>
              <ScheduleCountdown
                sample={row.clock}
                target={row.releaseAt}
                label="practice release"
              />
            </>
          )}
          {row.available && (
            <div className="flex flex-wrap gap-3">
              {row.activeAttemptId && (
                <Button asChild variant="outline">
                  <Link to={`/student/practice/${encodeURIComponent(row.activeAttemptId)}`}>
                    Resume practice
                  </Link>
                </Button>
              )}
              <StartPractice
                examId={row.examId}
                examVersion={row.examVersion}
                disabled={!row.available}
              />
            </div>
          )}
          {row.activeAttemptId && row.available && (
            <p className="text-sm text-muted-foreground">
              Starting again creates a separate attempt. Unfinished attempts do not count toward
              your best score.
            </p>
          )}
        </section>
      ))}
      {pagination.controls}
    </div>
  );
}

function PracticeQuestion({
  item,
  attemptId,
  onSaved,
}: {
  item: PracticeAttempt['items'][number];
  attemptId: string;
  onSaved: (a: PracticeAttempt) => Promise<void>;
}) {
  const api = practiceApi(useApiClient());
  const [choice, setChoice] = useState('');
  const [sent, setSent] = useState<{ value: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (request: { value: string; key: string }) =>
      api.answer(attemptId, item.itemId, request.value, request.key),
    onSuccess: onSaved,
  });
  return (
    <section className={`${panel} space-y-4`}>
      <h2 className="text-xl font-semibold">{item.stem}</h2>
      <p>{item.marks} marks</p>
      <fieldset disabled={!!item.feedback || !!sent || mutation.isPending}>
        <legend className="mb-2">Choose one answer</legend>
        {item.options.map((o) => (
          <label className="mb-2 flex min-h-11 items-start gap-3 rounded border p-3" key={o.id}>
            <input
              type="radio"
              name={`question-${item.itemId}`}
              value={o.id}
              checked={(item.feedback?.chosenOptionId ?? sent?.value ?? choice) === o.id}
              onChange={() => setChoice(o.id)}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      {item.feedback ? (
        <div role="status" className="rounded border bg-muted p-4">
          <p className="font-semibold">
            {item.feedback.correct ? 'Correct' : 'Incorrect'} · {item.feedback.earnedMarks} /{' '}
            {item.marks} marks
          </p>
          <p className="mt-2">
            Correct answer:{' '}
            {item.options.find((o) => o.id === item.feedback?.correctOptionId)?.text}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{item.feedback.explanation}</p>
          <p className="mt-2 text-sm">
            Your first answer is saved. Start a new practice attempt to try this question again.
          </p>
        </div>
      ) : (
        <>
          <Button
            disabled={!choice || mutation.isPending}
            onClick={() => {
              const request = sent ?? { value: choice, key: crypto.randomUUID() };
              setSent(request);
              mutation.mutate(request);
            }}
          >
            {mutation.isPending ? 'Checking answer…' : sent ? 'Retry same answer' : 'Check answer'}
          </Button>
          <Failure action error={mutation.error} />
          {mutation.error && (
            <p>
              Your answer may already be saved. Retry the same answer or refresh practice to check
              its status.
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function PracticeRunnerPage() {
  const { practiceAttemptId = '' } = useParams();
  return <PracticeRunner key={practiceAttemptId} practiceAttemptId={practiceAttemptId} />;
}
function PracticeRunner({ practiceAttemptId }: { practiceAttemptId: string }) {
  const api = practiceApi(useApiClient());
  const scope = useTeacherScope();
  const cache = useQueryClient();
  const queryKey = ['practice-attempt', ...scope, practiceAttemptId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.attempt(practiceAttemptId, signal),
  });
  const [index, setIndex] = useState(0);
  const completionKey = useRef(crypto.randomUUID());
  const saved = async (a: PracticeAttempt) => {
    cache.setQueryData(queryKey, a);
    await cache.invalidateQueries({ queryKey });
    await cache.invalidateQueries({
      predicate: (q) => ['practice-list', 'my-results'].includes(String(q.queryKey[0])),
    });
  };
  const complete = useMutation({
    mutationFn: () => api.complete(practiceAttemptId, completionKey.current),
    onSuccess: saved,
  });
  const attempt = query.data;
  const item = attempt?.items[index];
  const answered = attempt?.items.filter((i) => i.feedback).length ?? 0;
  return (
    <div className="space-y-6">
      <Link to="/student/practice" className="underline">
        Back to practice papers
      </Link>
      <h1 className="text-3xl font-semibold">Practice attempt</h1>
      <p>
        Practice is untimed. An internet connection is needed to check and save each answer.
        Official exam marks stay unchanged.
      </p>
      <RefreshControl
        label="Refresh practice attempt"
        busy={query.isFetching || complete.isPending}
        updatedAt={query.dataUpdatedAt}
        refresh={() => query.refetch()}
      />
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading practice…</p>}
      {attempt && !query.error && (
        <>
          <h2 className="text-2xl font-semibold">{attempt.title}</h2>
          <p className="whitespace-pre-wrap">{attempt.instructions}</p>
          <p>
            {answered} of {attempt.items.length} questions answered
          </p>
          {attempt.state === 'completed' && (
            <section className={`${panel} space-y-3`}>
              <h2 className="text-xl font-semibold">Practice completed</h2>
              <p>
                {attempt.score} / {attempt.maxScore} · {attempt.percent?.toFixed(1)}%
              </p>
              <p>Best completed practice score: {attempt.bestPercent?.toFixed(1)}%</p>
              <p>This score does not change your official result.</p>
              <StartPractice
                key={attempt.practiceAttemptId}
                examId={attempt.examId}
                examVersion={attempt.examVersion}
                disabled={false}
              />
            </section>
          )}
          <nav aria-label="Practice questions" className="flex flex-wrap gap-2">
            {attempt.items.map((q, n) => (
              <Button
                key={q.itemId}
                variant={n === index ? 'default' : 'outline'}
                aria-current={n === index ? 'step' : undefined}
                onClick={() => setIndex(n)}
                aria-label={`Question ${n + 1}${q.feedback ? ', answered' : ''}`}
              >
                {n + 1}
                {q.feedback ? ' ✓' : ''}
              </Button>
            ))}
          </nav>
          {item && (
            <PracticeQuestion
              key={`${practiceAttemptId}:${item.itemId}`}
              item={item}
              attemptId={practiceAttemptId}
              onSaved={saved}
            />
          )}
          {index + 1 < attempt.items.length && (
            <Button variant="outline" onClick={() => setIndex(index + 1)}>
              Next question
            </Button>
          )}
          {attempt.state === 'active' && (
            <section className={`${panel} space-y-3`}>
              <p>
                Complete every question, then finish this attempt to update your best practice
                score.
              </p>
              <Failure action error={complete.error} />
              <Button
                disabled={answered !== attempt.items.length || complete.isPending}
                onClick={() => complete.mutate()}
              >
                {complete.isPending ? 'Completing…' : 'Complete practice'}
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
