import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import type { RunnerEngine } from './engine';
import { useAntiScreenshot } from './useAntiScreenshot';
import { useWatermarkTamperDetector } from './useWatermarkTamperDetector';
import { AntiScreenshotOverlay } from './AntiScreenshotOverlay';
import { ExamWatermark } from './ExamWatermark';

/** Presentation lock only. The engine continues saving and enforcing the original deadline. */
export function ExamSecurityShield({
  engine,
  attemptId,
  examTitle,
  children,
  onRequestAssistance,
}: {
  engine: Pick<RunnerEngine, 'reportSecurityEvent'>;
  attemptId: string;
  examTitle: string;
  children: ReactNode;
  onRequestAssistance?: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [entered, setEntered] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const shield = useAntiScreenshot({
    active: entered,
    strict: true,
    requireFullscreen: true,
    maxIncidents: 5,
    onInterruption: (kind, reason) => engine.reportSecurityEvent(kind, reason),
    onLimitReached: () => setLocked(true),
  });
  const { tamperCount } = useWatermarkTamperDetector({
    active: entered,
    onTamper: (reason) => engine.reportSecurityEvent('watermark_tamper', reason),
  });
  return (
    <div className="exam-runner-protected space-y-5" data-tamper-count={tamperCount}>
      {!entered && (
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Ready to start?</h2>
          <p>
            Fullscreen is required. Leaving this window or using restricted shortcuts hides your
            questions. Five interruptions lock editing in this browser. Your original exam deadline
            continues.
          </p>
          <Button
            onClick={() => {
              setError('');
              void shield.enterFullscreen().then((ok) => {
                if (ok) setEntered(true);
                else
                  setError(
                    'Fullscreen could not start. Allow fullscreen in your browser or ask your invigilator for help.',
                  );
              });
            }}
          >
            Start exam
          </Button>
          {error && <p role="alert">{error}</p>}
        </section>
      )}
      {entered && (
        <>
          <ExamWatermark
            studentLoginId={session?.user.loginId}
            schoolName={session?.school.name}
            attemptId={attemptId}
            examTitle={examTitle}
          />
          <div
            inert={shield.isBlackedOut || locked}
            hidden={shield.isBlackedOut || locked}
            className="space-y-5"
          >
            {children}
          </div>
        </>
      )}
      <AntiScreenshotOverlay
        isBlackedOut={shield.isBlackedOut}
        blackoutReason={shield.blackoutReason}
        warningCount={shield.warningCount}
        onResume={shield.resume}
        resumeLocked={shield.resumeLocked}
        limitReached={locked || shield.limitReached}
        maxIncidents={5}
        assistanceAction={
          onRequestAssistance && (
            <div className="space-y-2">
              <Button
                disabled={requesting}
                onClick={() => {
                  setRequesting(true);
                  void onRequestAssistance()
                    .catch(() =>
                      setError('Request could not be sent. Ask your invigilator for help.'),
                    )
                    .finally(() => setRequesting(false));
                }}
              >
                Request invigilator help
              </Button>
              {error && <p role="alert">{error}</p>}
            </div>
          )
        }
      />
    </div>
  );
}
