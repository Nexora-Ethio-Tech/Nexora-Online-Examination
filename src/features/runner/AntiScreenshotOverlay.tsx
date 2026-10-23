import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AntiScreenshotOverlayProps {
  isBlackedOut: boolean;
  blackoutReason: 'blur' | 'screenshot' | 'devtools' | 'fullscreen' | null;
  warningCount: number;
  onResume: () => void;
  /** True during the short cool-down after a blackout; the resume button is disabled. */
  resumeLocked?: boolean;
  /** True once the incident limit is hit; the exam can no longer be resumed from here. */
  limitReached?: boolean;
  /** Shown as "Incident #n of max" when provided. */
  maxIncidents?: number;
  assistanceAction?: ReactNode;
}

export function AntiScreenshotOverlay({
  isBlackedOut,
  blackoutReason,
  warningCount,
  onResume,
  resumeLocked = false,
  limitReached = false,
  maxIncidents,
  assistanceAction,
}: AntiScreenshotOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Pull focus into the overlay so the window is focused and keyboard users land on it.
  useEffect(() => {
    if (isBlackedOut) dialogRef.current?.focus();
  }, [isBlackedOut]);

  if (!isBlackedOut || typeof document === 'undefined') return null;

  const getTitle = () => {
    switch (blackoutReason) {
      case 'screenshot':
        return 'Screen Capture Shortcut Detected';
      case 'devtools':
        return 'Inspection Shortcuts Blocked';
      case 'fullscreen':
        return 'Fullscreen Mode Exited';
      case 'blur':
      default:
        return 'Exam Window Focus Lost';
    }
  };

  const getDescription = () => {
    switch (blackoutReason) {
      case 'screenshot':
        return 'Nexora security detected a screen-capture shortcut and shielded the exam behind a full black screen. Clipboard clearing was requested, but your browser may not allow it.';
      case 'devtools':
        return 'Developer tools, page inspection, and printing shortcuts are disabled during active exam sittings.';
      case 'fullscreen':
        return 'This exam must stay in fullscreen. The exam screen is shielded behind a full black screen until you return to fullscreen.';
      case 'blur':
      default:
        return 'You switched away from the exam window, pressed a system key (Windows / Command / Alt), or moved the pointer outside the exam window. The exam screen is shielded behind a full black screen until you resume.';
    }
  };

  const resumeLabel =
    blackoutReason === 'fullscreen' ? 'Return to Fullscreen & Resume' : 'Acknowledge & Resume Exam';

  const overlay = (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="security-blackout-title"
      aria-describedby="security-blackout-desc"
      data-testid="anti-screenshot-overlay"
      className="fixed inset-0 z-[9999999] flex flex-col items-center justify-start overflow-y-auto bg-black p-6 text-center text-white outline-none select-none"
      style={{ backgroundColor: '#000000', opacity: 1 }}
    >
      <div className="mx-auto my-auto shrink-0 max-w-md space-y-5 rounded-2xl border border-red-500/40 bg-black p-6 sm:p-8 shadow-2xl shadow-red-950/80">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-950 text-red-400 ring-4 ring-red-500/30">
          <ShieldAlert className="size-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/30">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Security Incident #{warningCount}
            {maxIncidents ? ` of ${maxIncidents}` : ''} · Full Blackout Active
          </span>
          <h2
            id="security-blackout-title"
            className="text-xl font-bold tracking-tight text-white sm:text-2xl"
          >
            {limitReached ? 'Exam Locked' : getTitle()}
          </h2>
          <p id="security-blackout-desc" className="text-sm leading-relaxed text-neutral-300">
            {limitReached
              ? 'The maximum number of security incidents was reached. Editing is locked in this browser. Your saved answers are preserved. Please contact your proctor.'
              : getDescription()}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
          Detected interruptions are queued for school review and sent when connected. Your exam
          timer continues running.
        </div>

        {limitReached && assistanceAction}
        {!limitReached && (
          <div className="pt-2">
            <Button
              size="lg"
              disabled={resumeLocked}
              className="min-h-12 w-full bg-red-600 font-semibold text-white hover:bg-red-500 active:bg-red-700 disabled:opacity-60"
              onClick={onResume}
            >
              {resumeLocked ? 'Please wait…' : resumeLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Portal to <body> so the CSS shield can hide every other body child
  // without depending on the app's layout structure or stacking contexts.
  return createPortal(overlay, document.body);
}
