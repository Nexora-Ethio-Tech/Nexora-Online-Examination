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

export type IncidentGroup = 'tamper' | 'capture' | 'fullscreen' | 'switch' | 'other';
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
  { label: string; icon: typeof Camera; weight: number; chip: string; dot: string; card: string }
> = {
  tamper: {
    label: 'Tamper attempt',
    icon: ShieldX,
    weight: 5,
    chip: 'bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-300 dark:bg-fuchsia-950 dark:text-fuchsia-200 dark:ring-fuchsia-700',
    dot: 'bg-fuchsia-500',
    card: 'border-fuchsia-400',
  },
  capture: {
    label: 'Capture / inspection shortcut',
    icon: Camera,
    weight: 4,
    chip: 'bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-700',
    dot: 'bg-red-500',
    card: 'border-red-400',
  },
  fullscreen: {
    label: 'Fullscreen exit',
    icon: Minimize2,
    weight: 3,
    chip: 'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700',
    dot: 'bg-amber-500',
    card: 'border-amber-400',
  },
  switch: {
    label: 'Tab / window switch',
    icon: ArrowRightLeft,
    weight: 2,
    chip: 'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-700',
    dot: 'bg-orange-500',
    card: 'border-orange-400',
  },
  other: {
    label: 'Other event',
    icon: AlertCircle,
    weight: 2,
    chip: 'bg-slate-200 text-slate-900 ring-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-500',
    dot: 'bg-slate-500',
    card: 'border-slate-400',
  },
};

const GROUP_ORDER: IncidentGroup[] = ['tamper', 'capture', 'fullscreen', 'switch', 'other'];

export function classifyIncident(kind: string): IncidentGroup {
  if (kind === 'screenshot_attempt') return 'capture';
  if (kind === 'window_blur') return 'switch';
  if (kind === 'fullscreen_exit') return 'fullscreen';
  if (/tamper|watermark/i.test(kind)) return 'tamper';
  return 'other';
}

/* ------------------------------------------------------------------ */
/* Review recommendations only; no server penalty enforcement.     */
/* ------------------------------------------------------------------ */

type GroupCounts = Record<IncidentGroup, number>;

const emptyCounts = (): GroupCounts => ({
  tamper: 0,
  capture: 0,
  fullscreen: 0,
  switch: 0,
  other: 0,
});

function penaltyFor(c: GroupCounts): { label: string; tone: string } {
  const total = GROUP_ORDER.reduce((n, g) => n + c[g], 0);
  if (c.tamper > 0 || c.capture >= 2 || total >= 5) {
    return { label: 'Urgent proctor review recommended', tone: 'bg-red-700 text-white' };
  }
  if (c.capture > 0 || total >= 3) {
    return { label: 'Proctor review recommended', tone: 'bg-orange-600 text-white' };
  }
  if (total > 0) return { label: 'Warning recommended', tone: 'bg-amber-400 text-black' };
  return { label: 'No reported incidents', tone: 'bg-emerald-600 text-white' };
}

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

  // One row per attempt, worst first.
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
        score: number;
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
          score: 0,
        };
        map.set(i.attemptId, a);
      }
      const g = classifyIncident(i.kind);
      a.events.push(i);
      a.counts[g]++;
      if (i.reviewStatus !== 'dismissed') a.score += GROUPS[g].weight;
    }
    return [...map.values()]
      .map((a) => ({
        ...a,
        events: a.events.sort((x, y) => Date.parse(x.observedAt) - Date.parse(y.observedAt)),
      }))
      .sort((a, b) => b.score - a.score);
  }, [filtered]);

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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
        attempt(s). Recommendations use the visible reports only, not confirmed misconduct. No
        automatic server penalties are applied; dismissed events stay visible but are not scored.
      </p>

      {/* Attempts, worst first */}
      <ul className="space-y-3">
        {attempts.map((a) => {
          const penalty = penaltyFor(a.counts);
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
                <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${penalty.tone}`}>
                  {penalty.label}
                </span>
              </button>

              {open && (
                <ol className="space-y-2 border-t p-3">
                  {a.events.map((e) => {
                    const g = classifyIncident(e.kind);
                    const dismissed = e.reviewStatus === 'dismissed';
                    return (
                      <li key={e.id} className="flex flex-wrap items-center gap-3 text-sm">
                        <span
                          className={`size-2.5 shrink-0 rounded-full ${GROUPS[g].dot}`}
                          aria-hidden="true"
                        />
                        <time className="w-52 shrink-0 text-xs text-neutral-500">
                          {fmt(e.observedAt)}
                        </time>
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
                </ol>
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
    </section>
  );
}
