import { useLocalPagination } from '@/components/shared/Pagination';
import { ReadError } from '@/components/shared/ReadError';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { assistanceApi } from './api';
export function InvigilatorAssignments({ id }: { id: string }) {
  const client = useApiClient();
  const { session } = useAuth();
  const [selected, setSelected] = useState<{
    id: string;
    displayName: string;
    active: boolean;
    revision: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const staff = useQuery({
    queryKey: ['assistance', session?.school.id, session?.user.id, 'staff', id],
    queryFn: ({ signal }) => assistanceApi(client).staff(id, signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const page = useLocalPagination(staff.data?.staff ?? [], id);
  async function assign(staffId: string, active: boolean, expectedRevision: number) {
    setBusy(true);
    setMessage('');
    try {
      await assistanceApi(client).assign(id, { staffId, active, expectedRevision, reason: '' });
      setMessage('Staff assignment saved.');
      setSelected(null);
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
      <Button type="button" variant="outline" onClick={() => void staff.refetch()}>
        Refresh invigilators
      </Button>
      {staff.isPending && <p role="status">Loading staff…</p>}
      {staff.error && <ReadError error={staff.error} />}
      {staff.data?.staff.length === 0 && (
        <p>No staff accounts found. Create an invigilator account in School setup → Accounts.</p>
      )}
      {page.rows.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
          <p>
            {s.displayName} · {s.active ? 'Assigned' : 'Not assigned'} ·{' '}
            {s.mfaEnrolled ? 'Authenticator ready' : 'Authenticator setup needed'}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setSelected(s);
              setMessage('');
            }}
          >
            {s.active ? 'Revoke assignment' : 'Assign invigilator'}
          </Button>
        </div>
      ))}
      {page.controls}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected?.active ? 'Remove invigilator assignment' : 'Assign invigilator'}
            </DialogTitle>
            <DialogDescription>
              {selected?.displayName}. Confirm this assignment change.
            </DialogDescription>
          </DialogHeader>
          <Button
            disabled={busy || !staff.data || !!staff.error}
            onClick={() =>
              selected && void assign(selected.id, !selected.active, selected.revision)
            }
          >
            Confirm assignment change
          </Button>
          {message && <p role="status">{message}</p>}
        </DialogContent>
      </Dialog>
      {!selected && message && <p role="status">{message}</p>}
    </section>
  );
}
