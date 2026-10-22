import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tourPosition } from './tour-position';
import { Button } from '@/components/ui/button';

export type TourStep = { title: string; body: string; target: string };
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
  const shade = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement>(document.body);
  const [menuTarget, setMenuTarget] = useState(false);
  const [missingTarget, setMissingTarget] = useState(false);
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
    let frame = 0;
    const visible = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    function place() {
      const target =
        [...document.querySelectorAll<HTMLElement>(step?.target ?? '[data-tour-navigation]')].find(
          visible,
        ) ?? [...document.querySelectorAll<HTMLElement>('[data-tour-navigation]')].find(visible);
      const popup = box.current;
      if (!popup) return;
      const nextHost = target?.closest<HTMLElement>('[data-tour-menu]') ?? document.body;
      setHost((current) => (current === nextHost ? current : nextHost));
      setMissingTarget(!target);
      setMenuTarget(!!target?.hasAttribute('data-tour-navigation'));
      if (highlighted !== target) {
        highlighted?.classList.remove('nexora-tour-target');
        highlighted = target;
        target?.classList.add('nexora-tour-target');
        target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      const r = target?.getBoundingClientRect();
      if (!r) {
        if (shade.current) shade.current.style.display = 'none';
        Object.assign(popup.style, {
          left: '8px',
          top: '8px',
          width: Math.min(384, innerWidth - 16) + 'px',
          maxHeight: innerHeight - 16 + 'px',
        });
        return;
      }
      const position = tourPosition(r, { width: innerWidth, height: innerHeight });
      Object.assign(popup.style, {
        left: position.left + 'px',
        top: position.top + 'px',
        width: position.width + 'px',
        maxHeight: position.maxHeight + 'px',
      });
      if (shade.current) {
        const left = Math.max(0, r.left - 4),
          right = Math.min(innerWidth, r.right + 4);
        const top = Math.max(0, r.top - 4),
          bottom = Math.min(innerHeight, r.bottom + 4);
        Object.assign(shade.current.style, {
          display: 'block',
          clipPath:
            'polygon(0 0,100% 0,100% 100%,0 100%,0 0,' +
            left +
            'px ' +
            top +
            'px,' +
            left +
            'px ' +
            bottom +
            'px,' +
            right +
            'px ' +
            bottom +
            'px,' +
            right +
            'px ' +
            top +
            'px,' +
            left +
            'px ' +
            top +
            'px)',
        });
      }
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (box.current) resize.observe(box.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      highlighted?.classList.remove('nexora-tour-target');
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [open, step, host]);
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
      {open &&
        step &&
        createPortal(
          <>
            <div
              ref={shade}
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-[90] bg-black/60"
            />
            <aside
              ref={box}
              aria-label="Portal onboarding"
              aria-describedby={id}
              className="pointer-events-auto fixed z-[100] max-h-[calc(100dvh-1rem)] w-[min(24rem,calc(100vw-1rem))] space-y-3 overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-lg"
            >
              <p className="text-xs">
                Getting started · {progress.index + 1} of {steps.length}
              </p>
              <h2 className="text-lg font-semibold">{step.title}</h2>
              <p id={id} className="text-sm">
                {step.body}
              </p>
              <p className="text-sm">
                {missingTarget
                  ? 'This area is not visible on the current page. Return to the portal overview or continue to the next tip.'
                  : menuTarget
                    ? 'Open the highlighted Navigation button to find this area.'
                    : 'Select the highlighted area when you want to explore it.'}
              </p>
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
                  <Button onClick={() => update({ ...progress, completed: true })}>
                    Finish guide
                  </Button>
                )}
                <Button variant="ghost" onClick={() => update({ ...progress, paused: true })}>
                  Close guide
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Explore freely. Close this tip and use {label} to resume from here.
              </p>
            </aside>
          </>,
          host,
        )}
    </>
  );
}
