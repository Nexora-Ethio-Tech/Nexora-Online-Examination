import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/shared/DataTable';

type Row = { name: string };

const columns: ColumnDef<Row>[] = [{ accessorKey: 'name', header: 'Name' }];
const rows: Row[] = [{ name: 'Alpha' }, { name: 'Beta' }];

describe('DataTable', () => {
  it('renders rows and page information', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        page={1}
        pageSize={2}
        total={5}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('calls onPageChange with the next page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        page={1}
        pageSize={2}
        total={5}
        onPageChange={onPageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows the empty state when there are no rows', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        page={1}
        pageSize={2}
        total={0}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('shows the error state and retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        page={1}
        pageSize={2}
        total={0}
        onPageChange={vi.fn()}
        errorMessage="Failed to load"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
