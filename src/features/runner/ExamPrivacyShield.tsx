import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import './privacy-shield.css';

/** Display privacy only. Never changes engine time, saved evidence or staff authorization. */
export function ExamPrivacyShield({ children }: { children: ReactNode }) {
  const [covered, setCovered] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const resume = useRef<HTMLButtonElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const conceal = () => {
      if (content.current && !content.current.hidden) {
        priorFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      // Hide synchronously; React then renders the return controls. This is not a capture guarantee.
      if (content.current) content.current.hidden = true;
      setCovered(true);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') conceal();
    };
    window.addEventListener('blur', conceal);
    window.addEventListener('pagehide', conceal);
    window.addEventListener('beforeprint', conceal);
    document.addEventListener('visibilitychange', visibility);
    if (document.visibilityState === 'hidden' || !document.hasFocus()) conceal();
    return () => {
      window.removeEventListener('blur', conceal);
      window.removeEventListener('pagehide', conceal);
      window.removeEventListener('beforeprint', conceal);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (covered) resume.current?.focus();
  }, [covered]);
  return (
    <div className="exam-privacy-root">
      <p className="exam-print-notice">Exam content is unavailable for printing.</p>
      <div ref={content} hidden={covered} className="exam-private-content space-y-5">
        {children}
      </div>
      {covered && (
        <section className="exam-privacy-cover" aria-label="Exam privacy shield">
          <div className="max-w-md space-y-4 p-6">
            <h2 className="text-xl font-semibold">Exam content hidden</h2>
            <p>
              The exam was hidden while this window was inactive or printing was requested. Saved
              answers are retained. The timer continues.
            </p>
            <Button
              ref={resume}
              onClick={() => {
                if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
                setCovered(false);
                if (content.current) content.current.hidden = false;
                priorFocus.current?.focus();
              }}
            >
              Resume exam
            </Button>
            <p className="text-sm">
              This privacy shield cannot prevent every screenshot or recording.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
