import type { Interruption } from './supervision';

export const incidentLabels: Record<Interruption['kind'], string> = {
  hidden: 'Exam tab hidden',
  returned: 'Exam tab visible again',
  pagehide: 'Exam page left',
  fullscreen_exit: 'Full screen exited',
  focus_lost: 'Exam window became inactive',
  screenshot_attempt: 'Capture or inspection shortcut reported',
  devtools: 'Inspection or print action reported',
  window_blur: 'Screen protection activated after a focus or system-key event',
  watermark_tamper: 'Watermark integrity event reported',
};

/** Colors identify event types, never severity or confirmed misconduct. */
export function incidentBadgeClass(kind: Interruption['kind']) {
  switch (kind) {
    case 'screenshot_attempt':
      return 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200';
    case 'devtools':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200';
    case 'fullscreen_exit':
      return 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200';
    case 'watermark_tamper':
      return 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200';
    case 'hidden':
    case 'pagehide':
    case 'focus_lost':
    case 'window_blur':
      return 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200';
    default:
      return 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100';
  }
}
