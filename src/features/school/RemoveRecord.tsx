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
  const op = useSchoolOperation();
  const api = schoolApi(useApiClient());
  const noun = {
    classes: 'class',
    subjects: 'subject',
    students: 'student account',
    teachers: 'teacher account',
    invigilators: 'invigilator account',
    'teacher-assignments': 'teaching assignment',
  }[kind];
  const description =
    kind === 'classes'
      ? 'This removes the class from active class and assignment lists. Students’ accounts, previous exam results and existing exam records are retained.'
      : kind === 'teacher-assignments'
        ? 'This removes the teaching assignment from active use. Previous exam records and results are retained.'
        : kind === 'subjects'
          ? 'This removes the subject from active use. Previous exam records and results are retained.'
          : 'This removes the account from active use. Previous exam records and results are retained. Check that this person should no longer have access before continuing.';

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
          aria-label={`Delete ${noun}: ${label}`}
          title={`Delete ${noun}: ${label}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {noun} “{label}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description} Check that you have selected the correct {noun} before continuing.
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
          I understand and want to delete {noun} “{label}”.
        </label>
        {op.feedback}
        <div className="flex flex-wrap justify-end gap-3">
          <AlertDialogCancel disabled={op.pending}>Keep {noun}</AlertDialogCancel>
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
            {op.pending ? 'Deleting…' : `Delete ${noun}`}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
