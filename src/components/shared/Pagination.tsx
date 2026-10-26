import { useState, type ReactNode } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  hasNext,
  busy = false,
  previous,
  next,
}: {
  page: number;
  hasNext: boolean;
  busy?: boolean;
  previous: () => void;
  next: () => void;
}) {
  return (
    <div role="group" aria-label="Pagination" className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={busy || page <= 1} onClick={previous}>
        Previous page
      </Button>
      <span className="text-sm" aria-live="polite">
        Page {page}
      </span>
      <Button type="button" variant="outline" disabled={busy || !hasNext} onClick={next}>
        Next page
      </Button>
    </div>
  );
}

/** Keep fetched pages in Query's identity-scoped memory; render one page at a time. */
export function usePagedQuery<P>(
  query: {
    data: InfiniteData<P> | undefined;
    hasNextPage: boolean;
    isFetching: boolean;
    fetchNextPage: () => Promise<{ isError: boolean }>;
  },
  identity: string,
) {
  const [position, setPosition] = useState({ identity, index: 0 });
  const index =
    position.identity === identity
      ? Math.min(position.index, Math.max(0, (query.data?.pages.length ?? 1) - 1))
      : 0;
  const move = (value: number) => setPosition({ identity, index: value });
  const pages = query.data?.pages ?? [];
  const next = async () => {
    if (query.isFetching) return;
    if (index + 1 < pages.length) move(index + 1);
    else if (query.hasNextPage) {
      const result = await query.fetchNextPage();
      if (!result.isError) move(index + 1);
    }
  };
  return {
    page: pages[index],
    controls:
      pages.length > 1 || query.hasNextPage ? (
        <Pagination
          page={index + 1}
          busy={query.isFetching}
          hasNext={index + 1 < pages.length || query.hasNextPage}
          previous={() => move(Math.max(0, index - 1))}
          next={() => void next()}
        />
      ) : null,
  };
}

export function useLocalPagination<T>(items: T[], identity = '', pageSize = 25) {
  const [position, setPosition] = useState({ identity, index: 0 });
  const index =
    position.identity === identity
      ? Math.min(position.index, Math.max(0, Math.ceil(items.length / pageSize) - 1))
      : 0;
  const move = (value: number) => setPosition({ identity, index: value });
  return {
    rows: items.slice(index * pageSize, (index + 1) * pageSize),
    controls:
      items.length > pageSize ? (
        <Pagination
          page={index + 1}
          hasNext={(index + 1) * pageSize < items.length}
          previous={() => move(Math.max(0, index - 1))}
          next={() => move(index + 1)}
        />
      ) : null,
  };
}

export function PagedItems<T>({
  items,
  identity = '',
  children,
}: {
  items: T[];
  identity?: string;
  children: (rows: T[]) => ReactNode;
}) {
  const page = useLocalPagination(items, identity);
  return (
    <>
      {children(page.rows)}
      {page.controls}
    </>
  );
}

export function useCursorPages() {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  return {
    cursor: cursors.at(-1) ?? null,
    number: cursors.length,
    previous: () => setCursors((values) => (values.length > 1 ? values.slice(0, -1) : values)),
    next: (cursor: string) => setCursors((values) => [...values, cursor]),
    first: () => setCursors([null]),
  };
}
