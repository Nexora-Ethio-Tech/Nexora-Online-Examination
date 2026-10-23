import { CircleCheck, Clock3, FileText, Undo2 } from 'lucide-react';
export function ExamBadge({ status }: { status: 'draft' | 'in_review' | 'approved' | 'returned' }) {
  const options = {
    draft: { label: 'Draft', icon: FileText, color: 'bg-muted text-muted-foreground' },
    in_review: {
      label: 'Pending approval',
      icon: Clock3,
      color: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    },
    approved: {
      label: 'Approved',
      icon: CircleCheck,
      color: 'bg-primary/10 text-primary',
    },
    returned: { label: 'Returned', icon: Undo2, color: 'bg-destructive/10 text-destructive' },
  };
  const { label, icon: Icon, color } = options[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-1.5 text-xs font-medium ${color}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
