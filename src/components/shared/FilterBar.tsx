import { useId, useState, type ReactNode } from 'react';
export function FilterBar({
  label,
  children,
  more,
  inlineMore = false,
}: {
  label: string;
  children: ReactNode;
  more?: ReactNode;
  inlineMore?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  return (
    <section aria-label={label} className="space-y-2 rounded-xl border bg-background p-3">
      <div className="filter-bar flex flex-wrap items-end gap-2">
        {children}
        {more && inlineMore ? (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            aria-expanded={expanded}
            aria-controls={moreId}
            onClick={() => setExpanded(!expanded)}
          >
            More filters
          </button>
        ) : null}
      </div>
      {more && inlineMore ? (
        <div id={moreId} hidden={!expanded}>
          <div className="filter-bar flex flex-wrap items-end gap-2 border-t pt-3">{more}</div>
        </div>
      ) : more ? (
        <details>
          <summary className="cursor-pointer py-2 text-sm font-medium">More filters</summary>
          <div className="filter-bar flex flex-wrap items-end gap-2 pt-2">{more}</div>
        </details>
      ) : null}
    </section>
  );
}
