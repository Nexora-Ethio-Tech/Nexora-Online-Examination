import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export type TourStep = { title: string; body: string; target: string; open: () => void };
type Progress = { revision: string; index: number; completed: boolean; paused: boolean };
export function GuidedTour({
  storageKey,
  revision,
  steps,
  label = 'Portal guide',
}: {
  storageKey: string;
  revision: string;
  steps: TourStep[];
  label?: string;
}) {
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (
        raw &&
        typeof raw === 'object' &&
        'revision' in raw &&
        raw.revision === revision &&
        'index' in raw &&
        typeof raw.index === 'number' &&
        Number.isInteger(raw.index) &&
        raw.index >= 0 &&
        raw.index < steps.length &&
        'completed' in raw &&
        typeof raw.completed === 'boolean' &&
        'paused' in raw &&
        typeof raw.paused === 'boolean'
      )
        return { revision, index: raw.index, completed: raw.completed, paused: raw.paused };
    } catch {
      /* Storage preferences never block access. */
    }
    return { revision, index: 0, completed: false, paused: false };
  });
  const open = !progress.completed && !progress.paused;
  const step = steps[progress.index];
  const id = useId();
  const box = useRef<HTMLElement>(null);
  function update(next: Progress) {
    setProgress(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* optional preference */
    }
  }
  useEffect(() => {
    if (!open || !step) return;
    let highlighted: HTMLElement | undefined;
    function place() {
      const target =
        [...document.querySelectorAll<HTMLElement>(step?.target ?? 'main h1')].find(
          (el) => el.getBoundingClientRect().width > 0,
        ) ?? document.querySelector<HTMLElement>('main h1');
      if (highlighted !== target) {
        highlighted?.classList.remove('nexora-tour-target');
        highlighted = target ?? undefined;
        highlighted?.classList.add('nexora-tour-target');
      }
      const popup = box.current;
      if (!popup) return;
      const r = target?.getBoundingClientRect();
      const width = popup.offsetWidth,
        height = popup.offsetHeight;
      popup.style.left = `${Math.max(8, Math.min(r ? r.right + 12 : window.innerWidth - width - 16, window.innerWidth - width - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(r?.top ?? 80, window.innerHeight - height - 8))}px`;
    }
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      highlighted?.classList.remove('nexora-tour-target');
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, step]);
  return (
    <>
      <Button
        variant="outline"
        className="mb-4"
        onClick={() =>
          update({
            ...progress,
            index: progress.completed ? 0 : progress.index,
            completed: false,
            paused: false,
          })
        }
      >
        {label}
      </Button>
      {open && step && (
        <aside
          ref={box}
          aria-label="Portal onboarding"
          aria-describedby={id}
          className="fixed z-40 max-h-[calc(100dvh-1rem)] w-[min(24rem,calc(100vw-1rem))] space-y-3 overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-lg"
        >
          <p className="text-xs">
            Getting started · {progress.index + 1} of {steps.length}
          </p>
          <h2 className="text-lg font-semibold">{step.title}</h2>
          <p id={id} className="text-sm">
            {step.body}
          </p>
          <Button variant="outline" onClick={step.open}>
            Open this area
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={progress.index === 0}
              onClick={() => update({ ...progress, index: progress.index - 1 })}
            >
              Previous tip
            </Button>
            {progress.index + 1 < steps.length ? (
              <Button onClick={() => update({ ...progress, index: progress.index + 1 })}>
                Next tip
              </Button>
            ) : (
              <Button onClick={() => update({ ...progress, completed: true })}>Finish guide</Button>
            )}
            <Button variant="ghost" onClick={() => update({ ...progress, paused: true })}>
              Close guide
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Explore freely. Close this tip and use {label} to resume from here.
          </p>
        </aside>
      )}
    </>
  );
}
