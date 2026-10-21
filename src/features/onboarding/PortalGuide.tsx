import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import type { Role } from '@/features/auth/schemas';
import { guides, guideRevision } from './guide';

export function PortalGuide({
  schoolId,
  userId,
  role,
}: {
  schoolId: string;
  userId: string;
  role: Role;
}) {
  const storageKey = `nexora:guide:${schoolId}:${userId}:${role}`;
  const revision = guideRevision(role);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== revision;
    } catch {
      return true;
    }
  });
  const [index, setIndex] = useState(0);
  const steps = guides[role];
  const step = steps[index];
  function close() {
    try {
      localStorage.setItem(storageKey, revision);
    } catch {
      /* A blocked browser preference must not block the portal. */
    }
    setOpen(false);
  }
  return (
    <>
      <Button
        variant="outline"
        className="mb-4"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
      >
        Portal guide
      </Button>
      {open && step && (
        <aside
          aria-label="Portal onboarding"
          className="fixed right-4 bottom-4 z-40 max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100vw-2rem))] space-y-3 overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-lg"
        >
          <p className="text-xs">
            Getting started · {index + 1} of {steps.length}
          </p>
          <h2 className="text-lg font-semibold">{step.title}</h2>
          <p className="text-sm">{step.body}</p>
          <Link
            className="inline-block min-h-11 py-3 text-sm underline"
            to={step.path}
            onClick={close}
          >
            Open this area
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              Previous tip
            </Button>
            {index + 1 < steps.length ? (
              <Button onClick={() => setIndex((i) => i + 1)}>Next tip</Button>
            ) : (
              <Button onClick={close}>Finish guide</Button>
            )}
            <Button variant="ghost" onClick={close}>
              Close guide
            </Button>
          </div>
        </aside>
      )}
    </>
  );
}
