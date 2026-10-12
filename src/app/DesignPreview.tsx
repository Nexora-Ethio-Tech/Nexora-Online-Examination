import { useState } from 'react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { FormField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { ROLE_NAMES, useRoleTheme, type RoleName } from '@/lib/use-role-theme';

type Row = { id: number; name: string; status: 'active' | 'pending' };

const ALL_ROWS: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `Sample school ${index + 1}`,
  status: index % 3 === 0 ? 'pending' : 'active',
}));

const PAGE_SIZE = 5;

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.status === 'active' ? 'default' : 'secondary'}>
        {row.original.status}
      </Badge>
    ),
  },
];

export function DesignPreview() {
  const [role, setRole] = useState<RoleName>('teacher');
  const [page, setPage] = useState(1);
  const [showError, setShowError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [email, setEmail] = useState('');
  useRoleTheme(role);

  const start = (page - 1) * PAGE_SIZE;
  const rows = ALL_ROWS.slice(start, start + PAGE_SIZE);
  const emailError = showError ? 'Enter a valid email address' : undefined;

  return (
    <main className="mx-auto grid max-w-4xl gap-8 p-8">
      <PageHeader
        title="Exam Platform"
        description="Design system preview. Temporary page, removed in task W2-03."
        actions={<Button onClick={() => toast('Saved')}>Show toast</Button>}
      />

      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Role color</h2>
        <div className="flex flex-wrap gap-2">
          {ROLE_NAMES.map((name) => (
            <Button
              key={name}
              variant={name === role ? 'default' : 'outline'}
              onClick={() => setRole(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </section>

      <section className="grid max-w-sm gap-3">
        <h2 className="text-lg font-medium">Form field</h2>
        <FormField id="preview-email" label="Email" hint="We never share it." error={emailError}>
          {(control) => (
            <Input
              {...control}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>
        <Button variant="outline" onClick={() => setShowError((value) => !value)}>
          Toggle error
        </Button>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Data table</h2>
        <DataTable
          columns={columns}
          data={rows}
          page={page}
          pageSize={PAGE_SIZE}
          total={ALL_ROWS.length}
          onPageChange={setPage}
        />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Confirm dialog</h2>
        <div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete something
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete this item?"
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            toast('Confirmed');
          }}
        />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-medium">States</h2>
        <EmptyState
          title="No exams yet"
          description="Create your first exam to see it here."
          action={<Button>Create exam</Button>}
        />
        <ErrorState message="Could not load schools." onRetry={() => toast('Retry clicked')} />
        <div className="grid gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <Toaster />
    </main>
  );
}
