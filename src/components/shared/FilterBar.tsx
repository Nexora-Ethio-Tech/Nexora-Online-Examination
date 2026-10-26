import type { ReactNode } from 'react';
export function FilterBar({
  label,
  children,
  more,
}: {
  label: string;
  children: ReactNode;
  more?: ReactNode;
}) {
  return (
    <section aria-label={label} className="space-y-2 rounded-xl border bg-background p-3">
      <div className="filter-bar flex flex-wrap items-end gap-2">{children}</div>
      {more ? (
        <details>
          <summary className="cursor-pointer py-2 text-sm font-medium">More filters</summary>
          <div className="filter-bar flex flex-wrap items-end gap-2 pt-2">{more}</div>
        </details>
      ) : null}
    </section>
  );
}
