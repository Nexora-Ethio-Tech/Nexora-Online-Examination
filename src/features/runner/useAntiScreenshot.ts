import { useCallback, useEffect, useRef, useState } from 'react';

export type BlackoutReason = 'blur' | 'screenshot' | 'devtools' | 'fullscreen';
export type InterruptionKind = 'screenshot_attempt' | 'window_blur' | 'fullscreen_exit';

export interface AntiScreenshotOptions {
  active: boolean;
  onInterruption?: (kind: InterruptionKind, reason: string) => void;
  enabled?: boolean;
  /**
   * Strict mode (default: true). Adds pre-emptive triggers that fire BEFORE a capture tool can grab the frame:
   * Alt key press and pointer leaving the window (desktop only).
   * The Windows/Command key always triggers a blackout, strict or not.
   */
  strict?: boolean;
  /** Black out whenever fullscreen is exited after being entered, and require fullscreen to resume. */
  requireFullscreen?: boolean;
  /** After this many incidents the exam can no longer be resumed from the overlay. */
  maxIncidents?: number;
  onLimitReached?: () => void;
  /** Cool-down before the resume button works (default 1500 ms). */
  resumeDelayMs?: number;
}

export interface AntiScreenshotState {
  isBlackedOut: boolean;
  blackoutReason: BlackoutReason | null;
  warningCount: number;
  resume: () => void;
  resumeLocked: boolean;
  limitReached: boolean;
  /** Call from a click handler (needs a user gesture). Resolves true on success. */
  enterFullscreen: () => Promise<boolean>;
}

const BLACKOUT_CLASS = 'nexora-screen-blackout';
const LOCKED_KEYS = ['MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'Escape'];

interface KeyboardLockApi {
  lock?: (keyCodes?: string[]) => Promise<void>;
  unlock?: () => void;
}

const getKeyboardApi = (): KeyboardLockApi | undefined =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard;

const lockKeyboard = () => {
  try {
    const p = getKeyboardApi()?.lock?.(LOCKED_KEYS);
    p?.catch(() => {});
  } catch {
    // Keyboard Lock is Chromium-only and needs fullscreen; ignore if unavailable.
  }
};

const unlockKeyboard = () => {
  try {
    getKeyboardApi()?.unlock?.();
  } catch {
    // ignore
  }
};

const fullscreenSupported = () =>
  typeof document !== 'undefined' &&
  typeof document.documentElement.requestFullscreen === 'function';

export function useAntiScreenshot({
  active,
  onInterruption,
  enabled = true,
  strict = true,
  requireFullscreen = false,
  maxIncidents,
  onLimitReached,
  resumeDelayMs = 1500,
}: AntiScreenshotOptions): AntiScreenshotState {
  const [isBlackedOut, setIsBlackedOut] = useState(false);
  const [blackoutReason, setBlackoutReason] = useState<BlackoutReason | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [resumeLocked, setResumeLocked] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  // Latest options, so event listeners never need to be re-attached when callbacks change.
  const optsRef = useRef({
    onInterruption,
    onLimitReached,
    maxIncidents,
    resumeDelayMs,
    requireFullscreen,
  });
  optsRef.current = {
    onInterruption,
    onLimitReached,
    maxIncidents,
    resumeDelayMs,
    requireFullscreen,
  };

  const blackedOutRef = useRef(false);
  const episodeReasonsRef = useRef<Set<BlackoutReason>>(new Set());
  const warningCountRef = useRef(0);
  const limitFiredRef = useRef(false);
  const resumeLockedRef = useRef(false);
  const modifiersHeldRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDomBlackout = useCallback((activeState: boolean) => {
    if (typeof document === 'undefined') return;
    if (activeState) {
      document.documentElement.classList.add(BLACKOUT_CLASS);
      document.body?.classList.add(BLACKOUT_CLASS);
    } else {
      document.documentElement.classList.remove(BLACKOUT_CLASS);
      document.body?.classList.remove(BLACKOUT_CLASS);
    }
  }, []);

  const triggerBlackout = useCallback(
    (reason: BlackoutReason) => {
      if (!active || !enabled) return;

      // Always synchronous and always first: the DOM goes black before anything else happens.
      applyDomBlackout(true);

      const kind: InterruptionKind =
        reason === 'blur'
          ? 'window_blur'
          : reason === 'fullscreen'
            ? 'fullscreen_exit'
            : 'screenshot_attempt';

      if (blackedOutRef.current) {
        // Same incident: don't re-count, but do log a new kind of event once.
        if (!episodeReasonsRef.current.has(reason)) {
          episodeReasonsRef.current.add(reason);
          optsRef.current.onInterruption?.(kind, `Screen protection triggered by ${reason}`);
        }
        return;
      }

      blackedOutRef.current = true;
      episodeReasonsRef.current = new Set([reason]);
      warningCountRef.current += 1;
      const count = warningCountRef.current;

      setIsBlackedOut(true);
      setBlackoutReason(reason);
      setWarningCount(count);

      // Resume cool-down
      resumeLockedRef.current = true;
      setResumeLocked(true);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        resumeLockedRef.current = false;
        setResumeLocked(false);
      }, optsRef.current.resumeDelayMs);

      optsRef.current.onInterruption?.(kind, `Screen protection triggered by ${reason}`);

      const max = optsRef.current.maxIncidents;
      if (max && count >= max && !limitFiredRef.current) {
        limitFiredRef.current = true;
        setLimitReached(true);
        optsRef.current.onLimitReached?.();
      }
    },
    [active, enabled, applyDomBlackout],
  );

  const clearClipboard = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        navigator.clipboard.writeText('').catch(() => {});
      }
    } catch {
      // Ignore clipboard access restrictions
    }
  }, []);

  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    if (!fullscreenSupported()) return false;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
      lockKeyboard();
      return true;
    } catch {
      return false;
    }
  }, []);

  // Keep the DOM blackout class in place while blacked out (self-heals if someone strips it).
  useEffect(() => {
    applyDomBlackout(isBlackedOut);
    if (!isBlackedOut || typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(() => {
      const htmlOk = document.documentElement.classList.contains(BLACKOUT_CLASS);
      const bodyOk = !document.body || document.body.classList.contains(BLACKOUT_CLASS);
      if (!htmlOk || !bodyOk) applyDomBlackout(true);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (document.body)
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [isBlackedOut, applyDomBlackout]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      applyDomBlackout(false);
    };
  }, [applyDomBlackout]);

  // If protection is switched off, reset everything.
  useEffect(() => {
    if (active && enabled) return;
    blackedOutRef.current = false;
    episodeReasonsRef.current = new Set();
    setIsBlackedOut(false);
    setBlackoutReason(null);
  }, [active, enabled]);

  // Screen recording (getDisplayMedia) interception, with integrity check
  useEffect(() => {
    if (!active || !enabled || typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    const mediaDevices = navigator.mediaDevices;
    if (typeof mediaDevices.getDisplayMedia !== 'function') return;

    const original = mediaDevices.getDisplayMedia.bind(mediaDevices);
    const guard = async () => {
      triggerBlackout('screenshot');
      throw new DOMException(
        'Screen recording is prohibited during active exams.',
        'NotAllowedError',
      );
    };
    mediaDevices.getDisplayMedia = guard as typeof mediaDevices.getDisplayMedia;

    // If something swaps the patch out, put it back and treat it as an attempt.
    const integrity = setInterval(() => {
      if (mediaDevices.getDisplayMedia !== (guard as typeof mediaDevices.getDisplayMedia)) {
        mediaDevices.getDisplayMedia = guard as typeof mediaDevices.getDisplayMedia;
        triggerBlackout('screenshot');
      }
    }, 1000);

    return () => {
      clearInterval(integrity);
      mediaDevices.getDisplayMedia = original;
    };
  }, [active, enabled, triggerBlackout]);

  // Track whether Windows/Command/Alt is physically held (used to gate Resume).
  useEffect(() => {
    if (!active || !enabled) return;

    const syncFromEvent = (e: KeyboardEvent | MouseEvent) => {
      modifiersHeldRef.current = e.metaKey || e.altKey;
    };
    // The OS can swallow the keyup (e.g. Start menu), so a regained focus clears the flag.
    const reset = () => {
      modifiersHeldRef.current = false;
    };

    window.addEventListener('keydown', syncFromEvent, true);
    window.addEventListener('keyup', syncFromEvent, true);
    window.addEventListener('mousemove', syncFromEvent, true);
    window.addEventListener('pointerdown', syncFromEvent, true);
    window.addEventListener('focus', reset);

    return () => {
      window.removeEventListener('keydown', syncFromEvent, true);
      window.removeEventListener('keyup', syncFromEvent, true);
      window.removeEventListener('mousemove', syncFromEvent, true);
      window.removeEventListener('pointerdown', syncFromEvent, true);
      window.removeEventListener('focus', reset);
    };
  }, [active, enabled]);

  // Screenshot shortcuts + PRE-EMPTIVE system-key triggers + clipboard neutralization
  useEffect(() => {
    if (!active || !enabled) return;

    const wipeClipboardStaggered = () => {
      clearClipboard();
      setTimeout(clearClipboard, 50);
      setTimeout(clearClipboard, 150);
      setTimeout(clearClipboard, 300);
      setTimeout(clearClipboard, 500);
    };

    const isPrintScreen = (e: KeyboardEvent): boolean =>
      e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44;

    const isScreenshotCombo = (e: KeyboardEvent): boolean => {
      // Win+Shift+... / Cmd+Shift+... : the OS swallows the final key, but Shift arrives while Meta is held.
      const metaShift = e.metaKey && e.shiftKey;
      const snipping =
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        ['s', 'S', '3', '4', '5', 'r', 'R'].includes(e.key);
      const gameBar =
        e.metaKey &&
        ((e.altKey && (e.key === 'r' || e.key === 'R')) || e.key === 'g' || e.key === 'G');
      return isPrintScreen(e) || metaShift || snipping || gameBar;
    };

    // The Windows / Command key goes down BEFORE any capture chord completes.
    const isMetaKey = (e: KeyboardEvent): boolean =>
      e.key === 'Meta' || e.key === 'OS' || e.code === 'MetaLeft' || e.code === 'MetaRight';
    const isAltKey = (e: KeyboardEvent): boolean =>
      e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isScreenshotCombo(e)) {
        e.preventDefault();
        e.stopPropagation();
        applyDomBlackout(true);
        wipeClipboardStaggered();
        triggerBlackout('screenshot');
        return;
      }
      if (isMetaKey(e) || (strict && isAltKey(e))) {
        triggerBlackout('blur');
      }
    };

    // On Windows, PrintScreen often only produces a keyup, so handle it here too.
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isPrintScreen(e) || isScreenshotCombo(e)) {
        e.preventDefault();
        e.stopPropagation();
        wipeClipboardStaggered();
        triggerBlackout('screenshot');
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', '');
      }
      wipeClipboardStaggered();
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('cut', handleCopy, true);
    window.addEventListener('dragstart', handleDragStart, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('cut', handleCopy, true);
      window.removeEventListener('dragstart', handleDragStart, true);
    };
  }, [active, enabled, strict, triggerBlackout, clearClipboard, applyDomBlackout]);

  // Deny-by-default focus guard: events + 100 ms polling (blur events alone are unreliable)
  useEffect(() => {
    if (!active || !enabled) return;

    const handleWindowBlur = () => triggerBlackout('blur');
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') triggerBlackout('blur');
    };

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const poll = setInterval(() => {
      if (!document.hasFocus() || document.visibilityState !== 'visible') {
        triggerBlackout('blur');
      }
    }, 100);

    return () => {
      clearInterval(poll);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, enabled, triggerBlackout]);

  // STRICT: pointer leaving the window (heading for another monitor / a snipping toolbar)
  useEffect(() => {
    if (!active || !enabled || !strict || typeof window === 'undefined') return;
    const isTouchPrimary =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (isTouchPrimary) return;

    const handleLeave = () => triggerBlackout('blur');
    document.documentElement.addEventListener('mouseleave', handleLeave);
    return () => document.documentElement.removeEventListener('mouseleave', handleLeave);
  }, [active, enabled, strict, triggerBlackout]);

  // Fullscreen enforcement + Keyboard Lock (Chromium)
  useEffect(() => {
    if (!active || !enabled || !requireFullscreen || !fullscreenSupported()) return;

    let wasFullscreen = !!document.fullscreenElement;
    if (wasFullscreen) lockKeyboard();

    const handleChange = () => {
      if (document.fullscreenElement) {
        wasFullscreen = true;
        lockKeyboard();
      } else if (wasFullscreen) {
        wasFullscreen = false;
        unlockKeyboard();
        triggerBlackout('fullscreen');
      }
    };

    document.addEventListener('fullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      unlockKeyboard();
    };
  }, [active, enabled, requireFullscreen, triggerBlackout]);

  // Context menu, devtools / save / view-source / print shortcuts
  useEffect(() => {
    if (!active || !enabled) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleDevToolsKeys = (e: KeyboardEvent) => {
      const isF12 = e.key === 'F12' || e.code === 'F12';
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const isInspect =
        isCtrlOrMeta && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k'].includes(e.key);
      const isSave = isCtrlOrMeta && !e.shiftKey && ['s', 'S'].includes(e.key);
      const isViewSourceOrPrint = isCtrlOrMeta && ['u', 'U', 'p', 'P'].includes(e.key);
      const isContextMenuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');

      if (isF12 || isInspect || isSave || isViewSourceOrPrint || isContextMenuKey) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout('devtools');
      }
    };

    // Printing from the browser menu
    const handleBeforePrint = () => triggerBlackout('devtools');

    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('keydown', handleDevToolsKeys, true);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('keydown', handleDevToolsKeys, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [active, enabled, triggerBlackout]);

  const resume = useCallback(() => {
    if (!blackedOutRef.current) return;
    if (limitFiredRef.current || resumeLockedRef.current) return;
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    if (modifiersHeldRef.current) return;

    const finish = () => {
      blackedOutRef.current = false;
      episodeReasonsRef.current = new Set();
      applyDomBlackout(false);
      setIsBlackedOut(false);
      setBlackoutReason(null);
    };

    if (optsRef.current.requireFullscreen && fullscreenSupported() && !document.fullscreenElement) {
      void enterFullscreen().then((ok) => {
        if (ok) finish();
      });
      return;
    }

    finish();
  }, [applyDomBlackout, enterFullscreen]);

  return {
    isBlackedOut,
    blackoutReason,
    warningCount,
    resume,
    resumeLocked,
    limitReached,
    enterFullscreen,
  };
}
