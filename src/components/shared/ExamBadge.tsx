import { CircleCheck, Clock3, FileText, Undo2 } from 'lucide-react';
export function ExamBadge({ status }: { status: 'draft' | 'in_review' | 'approved' | 'returned' }) {
  const options = {
    draft: { label: 'Draft', icon: FileText, color: 'text-muted-foreground' },
    in_review: { label: 'Pending approval', icon: Clock3, color: 'text-foreground' },
    approved: {
      label: 'Approved',
      icon: CircleCheck,
      color: 'text-primary',
    },
    returned: { label: 'Returned', icon: Undo2, color: 'text-destructive' },
  };
  const { label, icon: Icon, color } = options[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 self-start py-1.5 text-xs font-medium ${color}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
