import { formatEatDateTime } from '@/lib/ethiopian-date';
import type { Interruption } from '@/features/runner/supervision';
import { InterruptionRecord } from './InterruptionRecord';
export type ReceivedInterruption = Interruption & { receivedAt: string };
const groups = [
  {
    title: 'Window and tab changes',
    description: 'The exam window became inactive or the page was left.',
    kinds: ['hidden', 'pagehide', 'focus_lost', 'window_blur'],
  },
  {
    title: 'Screen protection',
    description: 'Fullscreen exits and capture or inspection shortcuts reported by the browser.',
    kinds: ['fullscreen_exit', 'screenshot_attempt'],
  },
  {
    title: 'Watermark integrity',
    description: 'Changes to the exam watermark reported by the browser.',
    kinds: ['watermark_tamper'],
  },
  {
    title: 'Returns to the exam',
    description: 'The exam tab became visible again.',
    kinds: ['returned'],
  },
];
export function InterruptionGroups({ events }: { events: ReceivedInterruption[] }) {
  return (
    <section className="space-y-3" aria-label="Grouped browser activity">
      <h3 className="text-lg font-semibold">Activity summary</h3>
      <p className="text-sm text-muted-foreground">
        {events.length} received reports in this view (up to 100). Reports may arrive late and do
        not prove cheating. Open a category for details.
      </p>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {groups.map((group) => {
          const items = events
            .filter((event) => group.kinds.includes(event.kind))
            .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
          return (
            <details key={group.title} className="min-w-0 rounded border bg-background p-4">
              <summary className="min-h-11 cursor-pointer font-semibold">
                {group.title} · {items.length}
              </summary>
              <p className="my-2 text-sm">{group.description}</p>
              {items[0] && (
                <p className="text-xs text-muted-foreground">
                  Latest report received: {formatEatDateTime(items[0].receivedAt, true)}
                </p>
              )}
              {!items.length ? (
                <p className="text-sm">No reports in this category.</p>
              ) : (
                <ul className="max-h-96 overflow-y-auto">
                  {items.map((event) => (
                    <InterruptionRecord key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
