import { formatEatClock } from '@/lib/ethiopian-date';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RefreshControl({
  label,
  busy,
  updatedAt,
  refresh,
}: {
  label: string;
  busy: boolean;
  updatedAt: number;
  refresh: () => Promise<{ error: unknown }>;
}) {
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={busy || checking}
        onClick={async () => {
          setChecking(true);
          setMessage('Checking for updates…');
          try {
            const result = await refresh();
            setMessage(
              result.error
                ? 'Refresh failed. Previously shown data may be out of date. Try again.'
                : 'Updated successfully. You are viewing the latest response.',
            );
          } catch {
            setMessage('Refresh failed. Previously shown data may be out of date. Try again.');
          } finally {
            setChecking(false);
          }
        }}
      >
        <RefreshCw aria-hidden="true" className={busy || checking ? 'animate-spin' : ''} />
        {busy || checking ? 'Checking…' : label}
      </Button>
      {updatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          Last successful update: {formatEatClock(updatedAt, true)}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
