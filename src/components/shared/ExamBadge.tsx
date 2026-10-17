import { CircleCheck, Clock3, FileText, Undo2 } from 'lucide-react';
export function ExamBadge({ status }: { status: 'draft' | 'in_review' | 'approved' | 'returned' }) {
  const options = {
    draft: { label: 'Draft', icon: FileText, color: 'bg-muted text-foreground' },
    in_review: { label: 'Pending approval', icon: Clock3, color: 'bg-amber-100 text-amber-950' },
    approved: {
      label: 'Approved',
      icon: CircleCheck,
      color: 'bg-secondary text-secondary-foreground',
    },
    returned: { label: 'Returned', icon: Undo2, color: 'bg-rose-100 text-rose-950' },
  };
  const { label, icon: Icon, color } = options[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-medium ${color}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
