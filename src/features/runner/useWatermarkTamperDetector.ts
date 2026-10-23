import { useEffect, useRef, useState } from 'react';

export interface WatermarkTamperOptions {
  active: boolean;
  watermarkTestId?: string;
  overlayTestId?: string;
  onTamper: (reason: string) => void;
  enabled?: boolean;
  /** How often to re-check even when no DOM mutation happened (default 1000 ms). */
  checkIntervalMs?: number;
  /** Minimum time between two reports of the same reason (default 5000 ms). */
  reportCooldownMs?: number;
  /** Re-attach a removed watermark and strip inline overrides (default true). */
  selfHeal?: boolean;
}

const BLACKOUT_CLASS = 'nexora-screen-blackout';
const HEAL_PROPS = [
  'display',
  'visibility',
  'opacity',
  'clip-path',
  'filter',
  'width',
  'height',
  'position',
];

export function useWatermarkTamperDetector({
  active,
  watermarkTestId = 'exam-watermark',
  overlayTestId = 'anti-screenshot-overlay',
  onTamper,
  enabled = true,
  checkIntervalMs = 1000,
  reportCooldownMs = 5000,
  selfHeal = true,
}: WatermarkTamperOptions): { tamperCount: number } {
  const [tamperCount, setTamperCount] = useState(0);
  const onTamperRef = useRef(onTamper);
  onTamperRef.current = onTamper;

  useEffect(() => {
    if (
      !active ||
      !enabled ||
      typeof document === 'undefined' ||
      typeof MutationObserver === 'undefined'
    )
      return;

    const startedAt = Date.now();
    let disposed = false;
    let everSeen = false;
    let savedEl: Element | null = null;
    let savedParent: Node | null = null;
    let blackoutSince: number | null = null;
    let rafId = 0;
    const lastReport = new Map<string, number>();

    const report = (reason: string) => {
      const now = Date.now();
      if (now - (lastReport.get(reason) ?? 0) < reportCooldownMs) return;
      lastReport.set(reason, now);
      if (!disposed) setTamperCount((c) => c + 1);
      onTamperRef.current(reason);
    };

    const isBlackout = () =>
      document.documentElement.classList.contains(BLACKOUT_CLASS) ||
      !!document.body?.classList.contains(BLACKOUT_CLASS);

    const healInlineStyles = (el: Element) => {
      if (!selfHeal) return;
      const style = (el as HTMLElement).style;
      if (!style) return;
      for (const prop of HEAL_PROPS) style.removeProperty(prop);
    };

    const check = () => {
      // During a blackout the shield CSS hides the watermark on purpose: not tampering.
      // Instead, verify the blackout overlay itself is intact.
      if (isBlackout()) {
        if (blackoutSince === null) blackoutSince = Date.now();
        if (Date.now() - blackoutSince > 1000) {
          const overlay = document.querySelector(`[data-testid="${overlayTestId}"]`);
          if (!overlay) {
            report('Blackout overlay was removed from the DOM');
          } else {
            const s = window.getComputedStyle(overlay);
            if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.9) {
              report('Blackout overlay visibility was suppressed');
            }
          }
        }
        return;
      }
      blackoutSince = null;

      const watermarkEl = document.querySelector(`[data-testid="${watermarkTestId}"]`);

      if (!watermarkEl) {
        // Grace period: the watermark may not have mounted yet.
        if (!everSeen && Date.now() - startedAt < 3000) return;
        report('Watermark element was removed from the DOM');
        if (selfHeal && savedEl && savedParent && (savedParent as Node).isConnected) {
          (savedParent as Node).appendChild(savedEl);
        }
        return;
      }

      everSeen = true;
      savedEl = watermarkEl;
      savedParent = watermarkEl.parentNode;

      const style = window.getComputedStyle(watermarkEl);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        report('Watermark element visibility was suppressed');
        healInlineStyles(watermarkEl);
        return;
      }

      // Hidden through an ancestor?
      for (let node = watermarkEl.parentElement; node; node = node.parentElement) {
        const s = window.getComputedStyle(node);
        if (s.display === 'none' || Number(s.opacity) === 0) {
          report('Watermark ancestor was hidden');
          healInlineStyles(node);
          return;
        }
      }

      // Resized, clipped or moved away?
      const rect = watermarkEl.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.5 || rect.height < window.innerHeight * 0.5) {
        report('Watermark was resized or clipped');
        healInlineStyles(watermarkEl);
        return;
      }

      // Content stripped?
      const texts = Array.from(watermarkEl.querySelectorAll('pattern text'));
      if (texts.length === 0 || texts.every((t) => !t.textContent?.trim())) {
        report('Watermark text was removed');
        return;
      }
      if (!watermarkEl.querySelector('rect[fill^="url("]')) {
        report('Watermark pattern fill was removed');
        return;
      }

      // Shield stylesheet removed or overridden?
      const protectedEl = document.querySelector('.exam-runner-protected');
      if (protectedEl) {
        const ps = window.getComputedStyle(protectedEl);
        const userSelect = ps.getPropertyValue('user-select');
        const webkitUserSelect = ps.getPropertyValue('-webkit-user-select');
        if (userSelect !== 'none' && webkitUserSelect !== 'none') {
          report('Shield stylesheet was removed or overridden');
        }
      }
    };

    // Throttle mutation-triggered checks to one per frame.
    const scheduleCheck = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        check();
      });
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'fill', 'width', 'height'],
      characterData: true,
    });

    // Polling backstop: catches changes that don't produce a mutation (e.g. injected stylesheet rules).
    const interval = setInterval(check, checkIntervalMs);

    return () => {
      disposed = true;
      observer.disconnect();
      clearInterval(interval);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    active,
    enabled,
    watermarkTestId,
    overlayTestId,
    checkIntervalMs,
    reportCooldownMs,
    selfHeal,
  ]);

  return { tamperCount };
}
