import { useLocalPagination, PagedItems } from '@/components/shared/Pagination';
import { formatEatDateTime } from '@/lib/ethiopian-date';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Camera,
  ChevronDown,
  ChevronRight,
  Minimize2,
  ShieldX,
} from 'lucide-react';
import { findDelayedEvents, type SecurityEventItem } from './security-audit-report';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type IncidentGroup = 'tamper' | 'capture' | 'inspection' | 'fullscreen' | 'switch' | 'other';
export type ReviewStatus = 'unreviewed' | 'confirmed' | 'dismissed';

export interface IncidentRecord extends SecurityEventItem {
  studentLoginId: string;
  studentName?: string;
  attemptId: string;
  examTitle?: string;
  reviewStatus?: ReviewStatus;
}

export interface SecurityIncidentsPanelProps {
  incidents: IncidentRecord[];
  /** Called when a proctor confirms or dismisses an incident. Dismissed incidents stay visible. */
  onReview?: (incidentId: string, status: ReviewStatus) => void;
}

/* ------------------------------------------------------------------ */
/* Groups: every event kind lands in one group; nothing is hidden      */
/* ------------------------------------------------------------------ */

const GROUPS: Record<
  IncidentGroup,
  { label: string; icon: typeof Camera; chip: string; dot: string; card: string }
> = {
  tamper: {
    label: 'Watermark integrity report',
    icon: ShieldX,
    chip: 'bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-300 dark:bg-fuchsia-950 dark:text-fuchsia-200 dark:ring-fuchsia-700',
    dot: 'bg-fuchsia-500',
    card: 'border-fuchsia-400',
  },
  capture: {
    label: 'Capture / inspection shortcut',
    icon: Camera,
    chip: 'bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-700',
    dot: 'bg-red-500',
    card: 'border-red-400',
  },
  inspection: {
    label: 'Inspection / print action',
    icon: AlertCircle,
    chip: 'bg-blue-100 text-blue-900 ring-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-700',
    dot: 'bg-blue-500',
    card: 'border-blue-400',
  },
  fullscreen: {
    label: 'Fullscreen exit',
    icon: Minimize2,
    chip: 'bg-purple-100 text-purple-900 ring-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:ring-purple-700',
    dot: 'bg-purple-500',
    card: 'border-purple-400',
  },
  switch: {
    label: 'Tab / window switch',
    icon: ArrowRightLeft,
    chip: 'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-700',
    dot: 'bg-orange-500',
    card: 'border-orange-400',
  },
  other: {
    label: 'Other event',
    icon: AlertCircle,
    chip: 'bg-slate-200 text-slate-900 ring-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-500',
    dot: 'bg-slate-500',
    card: 'border-slate-400',
  },
};

const GROUP_ORDER: IncidentGroup[] = [
  'tamper',
  'capture',
  'inspection',
  'fullscreen',
  'switch',
  'other',
];

export function classifyIncident(kind: string): IncidentGroup {
  if (kind === 'screenshot_attempt') return 'capture';
  if (kind === 'devtools') return 'inspection';
  if (['window_blur', 'focus_lost', 'hidden', 'pagehide'].includes(kind)) return 'switch';
  if (kind === 'fullscreen_exit') return 'fullscreen';
  if (/tamper|watermark/i.test(kind)) return 'tamper';
  return 'other';
}

/* ------------------------------------------------------------------ */
/* Factual counts only; no scoring or disciplinary recommendations.     */
/* ------------------------------------------------------------------ */

type GroupCounts = Record<IncidentGroup, number>;

const emptyCounts = (): GroupCounts => ({
  tamper: 0,
  capture: 0,
  inspection: 0,
  fullscreen: 0,
  switch: 0,
  other: 0,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatEatDateTime(iso, true);
};

function GroupChip({ group }: { group: IncidentGroup }) {
  const g = GROUPS[group];
  const Icon = g.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${g.chip}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {g.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function SecurityIncidentsPanel({ incidents, onReview }: SecurityIncidentsPanelProps) {
  const [search, setSearch] = useState('');
  const [activeGroups, setActiveGroups] = useState<Set<IncidentGroup>>(new Set(GROUP_ORDER));
  const [status, setStatus] = useState<'all' | ReviewStatus>('all');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const delayedIds = useMemo(
    () => new Set(findDelayedEvents(incidents).map((e) => e.id)),
    [incidents],
  );

  // Summary cards always show the full, unfiltered totals.
  const totals = useMemo(() => {
    const c = emptyCounts();
    for (const i of incidents) c[classifyIncident(i.kind)]++;
    return c;
  }, [incidents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter((i) => {
      if (!activeGroups.has(classifyIncident(i.kind))) return false;
      if (status !== 'all' && (i.reviewStatus ?? 'unreviewed') !== status) return false;
      if (delayedOnly && !delayedIds.has(i.id)) return false;
      if (q) {
        const hay =
          `${i.studentLoginId} ${i.studentName ?? ''} ${i.examTitle ?? ''} ${i.attemptId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, search, activeGroups, status, delayedOnly, delayedIds]);

  // One row per attempt, most recently received first.
  const attempts = useMemo(() => {
    const map = new Map<
      string,
      {
        attemptId: string;
        studentLoginId: string;
        studentName?: string;
        examTitle?: string;
        events: IncidentRecord[];
        counts: GroupCounts;
      }
    >();
    for (const i of filtered) {
      let a = map.get(i.attemptId);
      if (!a) {
        a = {
          attemptId: i.attemptId,
          studentLoginId: i.studentLoginId,
          studentName: i.studentName,
          examTitle: i.examTitle,
          events: [],
          counts: emptyCounts(),
        };
        map.set(i.attemptId, a);
      }
      const g = classifyIncident(i.kind);
      a.events.push(i);
      a.counts[g]++;
    }
    return [...map.values()]
      .map((a) => ({
        ...a,
        events: a.events.sort(
          (x, y) =>
            Date.parse(y.receivedAt ?? y.observedAt) - Date.parse(x.receivedAt ?? x.observedAt),
        ),
      }))
      .sort(
        (a, b) =>
          Date.parse(b.events[0]?.receivedAt ?? b.events[0]?.observedAt ?? '') -
          Date.parse(a.events[0]?.receivedAt ?? a.events[0]?.observedAt ?? ''),
      );
  }, [filtered]);

  const pages = useLocalPagination(
    attempts,
    JSON.stringify([search, [...activeGroups], status, delayedOnly]),
  );
  const toggleGroup = (g: IncidentGroup) =>
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="space-y-5" aria-label="Security incidents">
      {/* Summary cards: unfiltered totals per group */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-3">
        {GROUP_ORDER.map((g) => {
          const Icon = GROUPS[g].icon;
          return (
            <div
              key={g}
              className={`rounded-xl border-l-4 border bg-white p-3 dark:bg-neutral-900 ${GROUPS[g].card}`}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                <Icon className="size-4" aria-hidden="true" />
                {GROUPS[g].label}
              </div>
              <div className="mt-1 text-2xl font-bold">{totals[g]}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 dark:bg-neutral-900">
        <input
          type="search"
          aria-label="Search security incidents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student, exam, attempt…"
          className="min-w-56 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {GROUP_ORDER.map((g) => {
            const on = activeGroups.has(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => toggleGroup(g)}
                className={`rounded-full px-1 transition ${on ? 'opacity-100' : 'opacity-40 grayscale'}`}
              >
                <GroupChip group={g} />
              </button>
            );
          })}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | ReviewStatus)}
          className="rounded-md border bg-transparent px-2 py-2 text-sm"
          aria-label="Review status"
        >
          <option value="all">All review states</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="confirmed">Confirmed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={delayedOnly}
            onChange={(e) => setDelayedOnly(e.target.checked)}
          />
          Delayed delivery only
        </label>
      </div>

      <p className="text-xs text-neutral-500">
        Showing {filtered.length} of {incidents.length} incidents across {attempts.length}{' '}
        attempt(s). Sorted by latest received report. Counts describe browser reports, not confirmed
        misconduct. No scores or disciplinary recommendations are assigned. Dismissed events remain
        visible. Time differences may reflect device clocks or network delays.
      </p>

      {/* Attempts, latest received first */}
      <ul className="space-y-3">
        {pages.rows.map((a) => {
          const open = expanded.has(a.attemptId);
          return (
            <li key={a.attemptId} className="rounded-xl border bg-white dark:bg-neutral-900">
              <button
                type="button"
                onClick={() => toggleExpanded(a.attemptId)}
                aria-expanded={open}
                className="flex w-full flex-wrap items-center gap-3 p-3 text-left"
              >
                {open ? (
                  <ChevronDown className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-4" aria-hidden="true" />
                )}
                <div className="min-w-40 flex-1">
                  <div className="font-semibold">{a.studentName ?? a.studentLoginId}</div>
                  <div className="text-xs text-neutral-500">
                    {a.studentLoginId} · {a.examTitle ?? 'Exam'} · {a.attemptId}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_ORDER.filter((g) => a.counts[g] > 0).map((g) => (
                    <span key={g} className="inline-flex items-center gap-1">
                      <GroupChip group={g} />
                      <span className="text-sm font-bold">×{a.counts[g]}</span>
                    </span>
                  ))}
                </div>
                <span className="text-xs">{a.events.length} reports</span>
              </button>

              {open && (
                <PagedItems items={a.events} identity={a.attemptId}>
                  {(pageEvents) => (
                    <>
                      {' '}
                      <ol className="space-y-2 border-t p-3">
                        {pageEvents.map((e) => {
                          const g = classifyIncident(e.kind);
                          const dismissed = e.reviewStatus === 'dismissed';
                          return (
                            <li key={e.id} className="flex flex-wrap items-center gap-3 text-sm">
                              <span
                                className={`size-2.5 shrink-0 rounded-full ${GROUPS[g].dot}`}
                                aria-hidden="true"
                              />
                              <time className="w-52 shrink-0 text-xs text-neutral-500">
                                Device reported: {fmt(e.observedAt)}
                              </time>
                              {e.receivedAt && (
                                <span className="text-xs">
                                  School received: {fmt(e.receivedAt)}
                                </span>
                              )}
                              <GroupChip group={g} />
                              <code className="text-xs text-neutral-500">{e.kind}</code>
                              {delayedIds.has(e.id) && (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                                  Delayed delivery
                                </span>
                              )}
                              {e.reviewStatus && e.reviewStatus !== 'unreviewed' && (
                                <span
                                  className={`text-xs font-medium ${dismissed ? 'text-neutral-500 line-through' : 'text-red-600'}`}
                                >
                                  {e.reviewStatus}
                                </span>
                              )}
                              {onReview && (
                                <span className="ml-auto flex gap-2">
                                  <button
                                    type="button"
                                    className="text-xs underline"
                                    onClick={() => onReview(e.id, 'confirmed')}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs underline"
                                    onClick={() => onReview(e.id, 'dismissed')}
                                  >
                                    Dismiss
                                  </button>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>{' '}
                    </>
                  )}
                </PagedItems>
              )}
            </li>
          );
        })}
        {attempts.length === 0 && (
          <li className="rounded-xl border p-6 text-center text-sm text-neutral-500">
            No incidents match the current filters.
          </li>
        )}
      </ul>
      {pages.controls}
    </section>
  );
}
