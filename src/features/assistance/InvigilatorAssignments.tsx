import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { assistanceApi } from './api';
export function InvigilatorAssignments({ id }: { id: string }) {
  const client = useApiClient();
  const { session } = useAuth();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const staff = useQuery({
    queryKey: ['assistance', 'staff', session?.school.id, session?.user.id, id],
    queryFn: ({ signal }) => assistanceApi(client).staff(id, signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
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
      <h2 className="text-lg font-semibold">Assign invigilators</h2>
      <p className="text-sm">
        Choose teachers, school administrators or non-teaching invigilators from this school. Staff
        can be assigned now, but must confirm their authenticator before approving requests.
        Administrators retain school-wide assistance access.
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
      <Button type="button" variant="outline" onClick={() => void staff.refetch()}>
        Refresh invigilators
      </Button>
      {staff.isPending && <p role="status">Loading staff…</p>}
      {staff.error && <p role="alert">{errorMessage(staff.error)}</p>}
      {staff.data?.staff.length === 0 && (
        <p>No staff accounts found. Create an invigilator account in School setup → Accounts.</p>
      )}
      {staff.data?.staff.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
          <p>
            {s.displayName} · {s.active ? 'Assigned' : 'Not assigned'} ·{' '}
            {s.mfaEnrolled ? 'Authenticator ready' : 'Authenticator setup needed'}
          </p>
          <Button
            variant="outline"
            disabled={busy || !reason.trim()}
            onClick={() => void assign(s.id, !s.active, s.revision)}
          >
            {s.active ? 'Revoke assignment' : 'Assign invigilator'}
          </Button>
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
