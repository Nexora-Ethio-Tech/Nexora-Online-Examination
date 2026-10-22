import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { schoolApi } from './api';
import { Reason, useSchoolOperation } from './SchoolSetupPage';

export function RemoveRecord({
  kind,
  id,
  revision,
  label,
}: {
  kind: 'classes' | 'subjects' | 'students' | 'teachers' | 'teacher-assignments';
  id: string;
  revision: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState('');
  const op = useSchoolOperation();
  const api = schoolApi(useApiClient());
  return (
    <div className="space-y-3">
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete {kind === 'classes' ? 'class: ' : ''}
        {label}
      </Button>
      {open && (
        <section className="space-y-3 rounded border p-4" aria-label={`Remove ${label}`}>
          <p>
            Remove this record from active use? Previous exam results remain available. Deleting a
            class does not delete its students’ accounts.
          </p>
          <Reason value={reason} onChange={setReason} />
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I want to remove {label}.
          </label>
          <Button
            variant="destructive"
            disabled={op.pending || !confirmed || !reason.trim()}
            onClick={() =>
              void op.run(
                JSON.stringify([kind, id, revision, reason]),
                (key) => api.remove(kind, id, revision, reason.trim(), key),
                (result) => {
                  setOutcome(result.outcome);
                  setOpen(false);
                },
              )
            }
          >
            Confirm removal
          </Button>
          <Button variant="outline" disabled={op.pending} onClick={() => setOpen(false)}>
            Keep record
          </Button>
        </section>
      )}
      {outcome && <p role="status">Record removed.</p>}
      {op.feedback}
    </div>
  );
}
