import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
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
  kind: 'classes' | 'subjects' | 'students' | 'teachers' | 'invigilators' | 'teacher-assignments';
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
  if (kind === 'classes') {
    return (
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (op.pending) return;
          setOpen(next);
          if (next) {
            setReason('');
            setConfirmed(false);
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
            aria-label={`Delete class: ${label}`}
            title={`Delete class: ${label}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete class “{label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the class from active class and assignment lists. Students’ accounts,
              previous exam results and existing exam records are retained. Check that you have
              selected the correct class before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Reason value={reason} onChange={setReason} />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={op.pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I understand and want to delete class “{label}”.
          </label>
          {op.feedback}
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialogCancel disabled={op.pending}>Keep class</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={op.pending || !confirmed || !reason.trim()}
              onClick={() =>
                void op.run(
                  JSON.stringify([kind, id, revision, reason]),
                  (key) => api.remove(kind, id, revision, reason.trim(), key),
                  () => setOpen(false),
                )
              }
            >
              {op.pending ? 'Deleting…' : 'Delete class'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  return (
    <div className="space-y-3">
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete {label}
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
