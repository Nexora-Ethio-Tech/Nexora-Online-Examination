import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { usePagedQuery } from './Pagination';

it('reuses cached pages, keeps the current page after failure, and resets when filters change', async () => {
  let fail = true;
  const read = vi.fn(async (filter: string, cursor: number) => {
    if (cursor === 1 && fail) throw new Error('offline');
    return { items: [`${filter}-${cursor}`], next: cursor < 2 ? cursor + 1 : null };
  });
  function List({ filter }: { filter: string }) {
    const query = useInfiniteQuery({
      queryKey: ['list', filter],
      initialPageParam: 0,
      queryFn: ({ pageParam }) => read(filter, pageParam),
      getNextPageParam: (p) => p.next ?? undefined,
    });
    const page = usePagedQuery(query, filter);
    return (
      <>
        <p>{page.page?.items.join(',')}</p>
        {page.controls}
      </>
    );
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const view = (filter: string) => (
    <QueryClientProvider client={client}>
      <List filter={filter} />
    </QueryClientProvider>
  );
  const { rerender } = render(view('a'));
  const user = userEvent.setup();
  await screen.findByText('a-0');
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
  expect(screen.getByText('a-0')).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('a-1');
  await user.click(screen.getByRole('button', { name: 'Previous page' }));
  await screen.findByText('a-0');
  const count = read.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('a-1');
  expect(read).toHaveBeenCalledTimes(count);
  rerender(view('b'));
  await screen.findByText('b-0');
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
});
