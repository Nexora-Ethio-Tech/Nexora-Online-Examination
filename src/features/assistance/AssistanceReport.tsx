import { Pagination, useCursorPages, useLocalPagination } from '@/components/shared/Pagination';
import { ReadError } from '@/components/shared/ReadError';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/lib/ApiProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { eatTime } from '@/features/exams/ExamsPage';
import { Button } from '@/components/ui/button';
import { assistanceApi } from './api';
const label = (outcome: string) =>
  outcome === 'assistance_approved'
    ? 'Approved'
    : outcome === 'assistance_rejected'
      ? 'Rejected'
      : 'Authenticator check failed';
export function AssistanceReport() {
  const client = useApiClient(),
    { session } = useAuth();
  const pages = useCursorPages();
  const before = pages.cursor;
  const report = useQuery({
    queryKey: ['assistance-report', session?.school.id, session?.user.id, before],
    queryFn: ({ signal }) => assistanceApi(client).report(before, signal),
  });
  const totals = useLocalPagination(report.data?.totals ?? [], before ?? '');
  return (
    <section className="space-y-4 rounded-xl border p-4" data-tour="assistance-report">
      <h2 className="text-xl font-semibold">Staff assistance history</h2>
      <p>
        Every recorded decision and failed authenticator check. Security interruptions are not proof
        of cheating.
      </p>
      <Button variant="outline" onClick={() => void report.refetch()}>
        Refresh history
      </Button>
      {report.isPending && <p>Loading history…</p>}
      {report.error && <ReadError error={report.error} />}
      {report.data && (
        <>
          <details>
            <summary>Totals by staff, student and exam</summary>
            <ul className="space-y-2">
              {totals.rows.map((t, i) => (
                <li key={i}>
                  {t.staffName} · {t.studentName} · {t.examTitle} · {label(t.outcome)}: {t.count}
                </li>
              ))}
            </ul>
            {totals.controls}
          </details>
          {report.data.events.length === 0 && <p>No assistance decisions recorded.</p>}
          {report.data.events.map((e) => (
            <article key={e.id} className="space-y-1 rounded-lg border p-3">
              <h3 className="font-semibold">
                {e.studentName} · {e.studentLoginId} — {label(e.outcome)}
              </h3>
              <p>
                {e.staffName} ({e.staffRole.replaceAll('_', ' ')}) · {e.examTitle}
              </p>
              <p>Sitting: {eatTime(e.startsAt)}</p>
              <p>
                Interruption: {e.interruptionKind.replaceAll('_', ' ')} · Requested:{' '}
                {eatTime(e.requestedAt)}
              </p>
              <p>Decision/check: {eatTime(e.decidedAt)}</p>
              <p>{e.reason}</p>
            </article>
          ))}
          <Pagination
            page={pages.number}
            hasNext={!!report.data.nextCursor}
            busy={report.isFetching}
            previous={pages.previous}
            next={() => {
              if (report.data?.nextCursor) pages.next(report.data.nextCursor);
            }}
          />
        </>
      )}
    </section>
  );
}
