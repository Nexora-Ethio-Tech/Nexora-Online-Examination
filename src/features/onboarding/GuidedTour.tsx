import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tourCornerRadius } from './tour-appearance';
import { tourTail } from './tour-tail';
import { tourPosition } from './tour-position';
import { tourTarget, type TourTarget } from './tour-target';
import { Button } from '@/components/ui/button';
import { CircleHelp } from 'lucide-react';

export type TourStep = { title: string; body: string } & TourTarget;
type Progress = { revision: string; index: number; completed: boolean; paused: boolean };
export function GuidedTour({
  storageKey,
  revision,
  steps,
  label = 'Portal guide',
  iconOnly = false,
}: {
  storageKey: string;
  revision: string;
  steps: TourStep[];
  label?: string;
  iconOnly?: boolean;
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
  const tail = useRef<SVGSVGElement>(null);
  const [host, setHost] = useState<HTMLElement>(document.body);
  const [targetKind, setTargetKind] = useState<'feature' | 'navigation' | 'menu'>('feature');
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
    // A new tip starts at its heading, even when the previous tip was scrolled.
    box.current?.firstElementChild?.scrollTo?.({ top: 0 });
    let highlighted: HTMLElement | undefined;
    let frame = 0;
    const resize = new ResizeObserver(schedule);
    function place() {
      // clientWidth excludes the page scrollbar, which can otherwise clip a rounded corner.
      const viewport = {
        width: document.documentElement.clientWidth || innerWidth,
        height: document.documentElement.clientHeight || innerHeight,
      };
      const resolved = step ? tourTarget(step) : null;
      const target = resolved?.element;
      const popup = box.current;
      if (!popup) return;
      const nextHost = target?.closest<HTMLElement>('[data-tour-menu]') ?? document.body;
      setHost((current) => (current === nextHost ? current : nextHost));
      setMissingTarget(!target);
      setTargetKind(resolved?.kind ?? 'feature');
      if (highlighted !== target) {
        if (highlighted) resize.unobserve(highlighted);
        highlighted?.classList.remove('nexora-tour-target');
        highlighted = target;
        target?.classList.add('nexora-tour-target');
        if (target) resize.observe(target);
        target?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
      const r = target?.getBoundingClientRect();
      if (!r) {
        if (shade.current) shade.current.style.display = 'none';
        if (tail.current) tail.current.style.display = 'none';
        Object.assign(popup.style, {
          left: '8px',
          top: '8px',
          width: Math.min(384, viewport.width - 16) + 'px',
          maxHeight: viewport.height - 16 + 'px',
        });
        return;
      }
      popup.style.width = Math.min(384, viewport.width - 16) + 'px';
      const contentHeight = (popup.firstElementChild?.scrollHeight ?? 320) + 2;
      const position = tourPosition(r, viewport, contentHeight);
      Object.assign(popup.style, {
        left: position.left + 'px',
        top: position.top + 'px',
        width: position.width + 'px',
        maxHeight: position.maxHeight + 'px',
      });
      if (tail.current) {
        const shape = tourTail(r, popup.getBoundingClientRect());
        tail.current.style.display = shape ? 'block' : 'none';
        tail.current
          .querySelector('[data-tail-fill]')
          ?.setAttribute('d', shape ? shape + ' Z' : '');
        tail.current.querySelector('[data-tail-edge]')?.setAttribute('d', shape ?? '');
      }
      if (shade.current) {
        const left = Math.max(0, r.left - 4),
          right = Math.min(viewport.width, r.right + 4);
        const top = Math.max(0, r.top - 4),
          bottom = Math.min(viewport.height, r.bottom + 4);
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
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    }
    place();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    if (box.current) resize.observe(box.current);
    resize.observe(document.body);
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
        className={iconOnly ? 'size-11 shrink-0' : 'mb-4'}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() =>
          update({
            ...progress,
            index: progress.completed ? 0 : progress.index,
            completed: false,
            paused: false,
          })
        }
      >
        {iconOnly ? <CircleHelp className="size-5" aria-hidden="true" /> : label}
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
              style={{ borderRadius: tourCornerRadius }}
              className="pointer-events-auto fixed z-[100] max-h-[calc(100dvh-1rem)] w-[min(24rem,calc(100vw-1rem))] overflow-hidden border border-primary/20 bg-background text-foreground shadow-[0_18px_60px_-16px_rgba(0,0,0,0.45)]"
            >
              <div className="max-h-[inherit] space-y-3 overflow-y-auto p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Getting started · {progress.index + 1} of {steps.length}
                </p>
                <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
                <p id={id} className="text-sm leading-relaxed">
                  {step.body}
                </p>
                <p className="text-sm">
                  {missingTarget
                    ? 'This area is not visible on the current page. Return to the portal overview or continue to the next tip.'
                    : targetKind === 'menu'
                      ? 'Open the highlighted Navigation button to find this area.'
                      : targetKind === 'navigation'
                        ? 'Open the highlighted page to find these controls. The guide will point to them when they are visible.'
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
              </div>
            </aside>
            <svg
              ref={tail}
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-[101] h-full w-full overflow-visible"
              data-tour-tail
            >
              <path data-tail-fill fill="var(--background)" />
              <path
                data-tail-edge
                fill="none"
                stroke="color-mix(in oklab, var(--primary) 20%, transparent)"
                strokeWidth="1"
              />
            </svg>
          </>,
          host,
        )}
    </>
  );
}
