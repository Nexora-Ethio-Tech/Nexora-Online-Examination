import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { useAuth } from '@/features/auth/AuthProvider';
import { eatTime } from '@/features/exams/ExamsPage';
import { assistanceApi, inboxSchema } from './api';

export function AssistancePage() {
  const client = useApiClient();
  const { session } = useAuth();
  const [selected, setSelected] = useState('');
  const sessions = useQuery({
    queryKey: ['assistance', 'sessions'],
    queryFn: ({ signal }) => assistanceApi(client).sessions(signal),
  });
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-semibold">Exam assistance</h1>
      <p>
        Review help requests on your own device. Approving lets the student open the exam again and
        continue; it does not extend the deadline or lift an administrative suspension.
      </p>
      <label className="block">
        Exam sitting
        <select
          className="mt-2 min-h-11 w-full rounded border bg-background p-2"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a sitting</option>
          {sessions.data?.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} — {eatTime(s.startsAt)}
            </option>
          ))}
        </select>
      </label>
      {sessions.isPending && <p role="status">Loading sittings…</p>}
      {sessions.error && <p role="alert">{errorMessage(sessions.error)}</p>}
      {sessions.data?.sessions.length === 0 && (
        <p>No assigned sittings are available. Ask your school administrator.</p>
      )}
      {selected && (
        <Sitting key={selected} id={selected} admin={session?.user.role === 'school_admin'} />
      )}
    </main>
  );
}
function Sitting({ id, admin }: { id: string; admin: boolean }) {
  const client = useApiClient();
  const inbox = useQuery({
    queryKey: ['assistance', 'inbox', id],
    queryFn: ({ signal }) => assistanceApi(client).inbox(id, signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  return (
    <div className="space-y-5">
      <p className="text-sm">
        Refreshes every 15 seconds while visible. Last successful check:{' '}
        {inbox.dataUpdatedAt
          ? eatTime(new Date(inbox.dataUpdatedAt).toISOString())
          : 'Not yet confirmed'}
        .
      </p>
      <Button variant="outline" onClick={() => void inbox.refetch()}>
        Refresh requests
      </Button>
      {inbox.isPending && <p role="status">Loading requests…</p>}
      {inbox.error && <p role="alert">Requests may be stale. {errorMessage(inbox.error)}</p>}
      {inbox.data?.requests.length === 0 && <p>No pending, unexpired requests.</p>}
      {inbox.data?.requests.map((request) => (
        <Decision key={request.id} request={request} refresh={() => void inbox.refetch()} />
      ))}
      {admin && <Assignments id={id} />}
    </div>
  );
}
function Decision({
  request,
  refresh,
}: {
  request: z.infer<typeof inboxSchema>['requests'][number];
  refresh: () => void;
}) {
  const client = useApiClient();
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function decide(action: 'approve' | 'reject') {
    setBusy(true);
    setMessage('');
    const submittedCode = code;
    setCode('');
    try {
      await assistanceApi(client).decide(request.id, { action, reason, code: submittedCode });
      setMessage(
        action === 'approve'
          ? 'Approved. The student can open the exam again.'
          : 'Rejected. Editing remains paused.',
      );
      refresh();
    } catch (failure) {
      setMessage(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border p-4"
      aria-label={`Assistance for ${request.loginId}`}
    >
      <h2 className="font-semibold">
        {request.displayName} · {request.loginId}
      </h2>
      <p className="text-sm">
        Workstation generation {request.deviceGeneration} · Expires {eatTime(request.expiresAt)}
      </p>
      <label className="block">
        Decision reason
        <textarea
          className="mt-1 w-full rounded border bg-background p-2"
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="block">
        Your authenticator code
        <input
          className="mt-1 block min-h-11 rounded border bg-background p-2"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={code}
          disabled={busy}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <p className="text-sm">
        Use a fresh code from your confirmed authenticator. Never enter it on the student's device.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy || !reason.trim() || !/^\d{6}$/.test(code)}
          onClick={() => void decide('approve')}
        >
          Approve reopening
        </Button>
        <Button
          variant="outline"
          disabled={busy || !reason.trim() || !/^\d{6}$/.test(code)}
          onClick={() => void decide('reject')}
        >
          Reject request
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function Assignments({ id }: { id: string }) {
  const client = useApiClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const staff = useQuery({
    queryKey: ['assistance', 'staff', id],
    queryFn: ({ signal }) => assistanceApi(client).staff(id, signal),
  });
  async function assign(staffId: string, active: boolean, expectedRevision: number) {
    setBusy(true);
    setMessage('');
    try {
      await assistanceApi(client).assign(id, { staffId, active, expectedRevision, reason });
      setMessage('Staff assignment saved.');
    } catch (failure) {
      setMessage(errorMessage(failure));
    } finally {
      await staff.refetch();
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Assign teachers to this sitting</h2>
      <p className="text-sm">
        Teachers need confirmed MFA enrollment through the protected operator tool before
        assignment. School administrators already have school-wide assistance access.
      </p>
      <label className="block">
        Assignment change reason
        <input
          className="mt-1 min-h-11 w-full rounded border bg-background p-2"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {staff.isPending && <p role="status">Loading staff…</p>}
      {staff.error && <p role="alert">{errorMessage(staff.error)}</p>}
      {staff.data?.staff
        .filter((s) => s.role === 'teacher')
        .map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
          >
            <p>
              {s.displayName} · {s.active ? 'Assigned' : 'Not assigned'} ·{' '}
              {s.mfaEnrolled ? 'MFA confirmed' : 'MFA required'}
            </p>
            <Button
              variant="outline"
              disabled={busy || !reason.trim() || (!s.active && !s.mfaEnrolled)}
              onClick={() => void assign(s.id, !s.active, s.revision)}
            >
              {s.active ? 'Revoke assignment' : 'Assign teacher'}
            </Button>
          </div>
        ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
