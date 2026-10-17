import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ShieldCheck, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { ApiError, errorMessage } from '@/lib/api-client';
import { examApi } from './api';
import { preparePaper, preparationSteps, type PreparationStep } from './preparation';
import { eatTime, examStatus } from './ExamsPage';
export function clockSample(serverNow: string, receivedAt = performance.now()) {
  return { epoch: Date.parse(serverNow), receivedAt };
}
export function serverTime(sample: ReturnType<typeof clockSample>, now = performance.now()) {
  return sample.epoch + Math.max(0, now - sample.receivedAt);
}
function Countdown({
  sample,
  target,
  label = 'common start',
}: {
  sample: ReturnType<typeof clockSample>;
  target: string;
  label?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(target) - serverTime(sample)) / 1000));
  return (
    <p className="mt-4 rounded-xl bg-muted p-4 text-lg font-semibold tabular-nums text-foreground">
      {seconds
        ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s until ${label}`
        : `${label === 'common start' ? 'Start' : 'Preparation'} time reached. Refresh the schedule for the latest status.`}
    </p>
  );
}
export function PreparationPage() {
  const { sessionId = '' } = useParams();
  const { session } = useAuth();
  // Route identity owns mutation state; navigating to another paper resets it.
  return (
    <PreparationContent
      key={JSON.stringify([session?.school.id, session?.user.id, sessionId])}
      sessionId={sessionId}
    />
  );
}
function PreparationContent({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [refreshMessage, setRefreshMessage] = useState('');
  const [step, setStep] = useState<PreparationStep | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const { session } = useAuth();
  const client = useApiClient();
  const api = examApi(client);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const query = useQuery({
    queryKey: ['exam', session?.school.id, session?.user.id, sessionId],
    queryFn: async ({ signal }) => {
      const result = await api.detail(sessionId, signal);
      return { ...result, clock: clockSample(result.serverNow) };
    },
    refetchInterval: 15_000,
  });
  const preparation = useMutation({
    mutationFn: async () => {
      if (!session || !query.data) throw new Error('Session unavailable.');
      operation.current?.abort();
      const controller = new AbortController();
      operation.current = controller;
      return preparePaper(
        api,
        { schoolId: session.school.id, userId: session.user.id },
        query.data.exam,
        controller.signal,
        setStep,
      );
    },
    onSuccess: () => {
      void query.refetch();
    },
  });
  const exam = query.data?.exam;
  useEffect(() => {
    if (
      preparation.data &&
      query.data &&
      serverTime(query.data.clock) >= Date.parse(preparation.data.attempt.startsAt) &&
      serverTime(query.data.clock) < Date.parse(preparation.data.attempt.deadlineAt)
    ) {
      void navigate(`/student/attempts/${encodeURIComponent(preparation.data.attempt.attemptId)}`);
    }
  }, [preparation.data, query.data, navigate, tick]);
  const canPrepare =
    exam &&
    ['preparing', 'open'].includes(exam.phase) &&
    (!exam.attemptState || exam.attemptState === 'preparing');
  const deviceError =
    preparation.error instanceof ApiError && preparation.error.code === 'DEVICE_REPLACED';
  return (
    <div className="space-y-6">
      <Link
        to="/student"
        className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
      >
        ← My exams
      </Link>
      {query.isPending ? <p role="status">Loading schedule…</p> : null}
      {query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {exam && query.data ? (
        <>
          <div className="page-intro">
            <p className="mb-2 text-sm text-muted-foreground">
              {exam.subjectName} · {exam.className}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{exam.title}</h1>
            <p className="mt-3 text-sm font-medium">{examStatus(exam)}</p>
          </div>
          <dl className="grid gap-5 nexora-surface rounded-xl border bg-background p-6 sm:grid-cols-2">
            {[
              ['Preparation opens', exam.preparationVisibleAt],
              ['Common start', exam.startsAt],
              ['Common end', exam.endsAt],
              ['Your deadline', exam.deadlineAt],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {value ? eatTime(value) : 'Unavailable'}
                </dd>
              </div>
            ))}
          </dl>
          <section className="nexora-surface rounded-xl border bg-background p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <LockKeyhole className="size-5" aria-hidden="true" />
              Prepare this browser
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Preparation saves an encrypted paper on this device. Questions remain locked until the
              server authorizes access at the common start.
            </p>
            {exam.phase === 'scheduled' ? (
              <div>
                <Countdown
                  sample={query.data.clock}
                  target={exam.preparationVisibleAt}
                  label="preparation"
                />
                <p className="mt-4 text-sm">
                  Return at {eatTime(exam.preparationVisibleAt)}. Viewing this schedule does not
                  create an attempt.
                </p>
              </div>
            ) : null}
            {canPrepare ? (
              <>
                <Countdown sample={query.data.clock} target={exam.startsAt} />
                <Button
                  className="mt-5 h-auto min-h-11 whitespace-normal py-3"
                  disabled={preparation.isPending || !!query.error}
                  onClick={() => preparation.mutate()}
                >
                  {preparation.isPending
                    ? 'Checking device and saving paper…'
                    : preparation.data
                      ? 'Verify and download again'
                      : preparation.isError
                        ? 'Retry preparation'
                        : 'Download encrypted paper'}
                </Button>
              </>
            ) : null}
            {exam.attemptState === 'active' ? (
              <p className="mt-4 text-sm">
                An attempt is in progress. Reopen it on the same browser to revalidate and continue.
                Your original deadline still applies.
              </p>
            ) : null}
            {exam.phase === 'ended' && !exam.attemptState ? (
              <p className="mt-4 text-sm">
                This exam window has ended. A new attempt cannot be started.
              </p>
            ) : null}
            {exam.attemptState &&
            ['awaiting_upload', 'recovery_pending', 'submitted', 'invalidated'].includes(
              exam.attemptState,
            ) ? (
              <p className="mt-4 text-sm">
                {exam.attemptState === 'submitted'
                  ? 'The server reports a recorded submission. Open the attempt to verify its receipt against this device’s saved final answers.'
                  : 'This attempt needs no new paper download. Contact your school about its recorded status. Retain any pending work on the original browser.'}
              </p>
            ) : null}
          </section>
          {exam.attemptId ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link to={`/student/attempts/${encodeURIComponent(exam.attemptId)}`}>
                Open saved attempt
              </Link>
            </Button>
          ) : null}
          {exam.attemptId && (
            <Link
              to="/student/device"
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Need a replacement browser? Register it for school approval.
            </Link>
          )}
          {step ? (
            <section
              className="nexora-surface rounded-xl border bg-background p-5"
              aria-label="Preparation progress"
            >
              <h2 className="font-semibold">Preparation progress</h2>
              <p role="status" className="mt-2 text-sm">
                {preparation.isPending
                  ? `In progress: ${preparationSteps.find((s) => s.id === step)?.label}`
                  : preparation.isError
                    ? `Stopped: ${preparationSteps.find((s) => s.id === step)?.label}`
                    : preparation.data?.shell === 'development'
                      ? 'Paper saved. Offline app verification is unavailable in the demo.'
                      : 'All preparation checks completed.'}
              </p>
              <ol className="mt-3 space-y-2 text-sm">
                {preparationSteps.map((entry, index) => {
                  const current = preparationSteps.findIndex((s) => s.id === step);
                  const label =
                    index < current
                      ? 'Complete'
                      : index > current
                        ? 'Not started'
                        : preparation.isPending
                          ? 'In progress'
                          : preparation.isError
                            ? 'Stopped'
                            : preparation.data?.shell === 'development'
                              ? 'Unavailable in demo'
                              : 'Complete';
                  return (
                    <li key={entry.id}>
                      {entry.label}: <strong>{label}</strong>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
          {preparation.error ? (
            <div role="alert" className="rounded-xl border border-destructive/30 p-5 text-sm">
              <p>{errorMessage(preparation.error)}</p>
              {step === 'report' && (
                <p className="mt-2">
                  Local preparation checks passed, but the school report is not confirmed. Retry
                  preparation to resend it safely. This does not change your exam deadline.
                </p>
              )}
              <p className="mt-2">
                Keep this page open and retain browser storage. Resolve the issue above, then retry
                preparation while connected. If the exam window has closed, contact your school.
              </p>
              {deviceError ? (
                <p className="mt-2">
                  This browser’s device credential needs school assistance. Do not clear browser
                  storage or attempt to take over an existing sitting.
                </p>
              ) : null}
            </div>
          ) : null}
          {preparation.isSuccess &&
          preparation.data &&
          preparation.data.attempt.scheduleRevision === exam.scheduleRevision ? (
            <div role="status" className="rounded-xl border bg-primary/5 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5" aria-hidden="true" />
                {preparation.data.shell === 'ready'
                  ? 'Ready for the common start'
                  : 'Encrypted paper saved'}
              </h2>
              <p className="mt-2 text-sm">
                {preparation.data.shell === 'ready'
                  ? 'Paper integrity, local storage and offline app files verified and reported to your school. Keep this tab open; the exam opens at the common start after online authorization.'
                  : 'Checksum verified and browser storage write confirmed. No verified readiness report is sent in development mode: the development server must stay running. The exam opens at the common start after online authorization.'}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">
            Keep this tab open after preparing. An internet connection is required to unlock the
            paper and to reopen after a reload. Once unlocked, answers can be saved on this device
            during an interruption.
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={query.isFetching}
            onClick={async () => {
              setRefreshMessage('Checking the latest schedule…');
              const result = await query.refetch();
              setRefreshMessage(
                result.error
                  ? 'Schedule could not be updated. Check your connection and try again.'
                  : `Schedule updated. Last checked: ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(result.data?.serverNow ?? query.data.serverNow))} EAT.`,
              );
            }}
          >
            {query.isFetching ? 'Checking schedule…' : 'Refresh schedule'}
          </Button>
          {refreshMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {refreshMessage}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
