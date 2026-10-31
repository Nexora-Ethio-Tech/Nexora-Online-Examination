
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import type { ApiClient } from '@/lib/api-client';

export function ConnectionStatus({ client }: { client: ApiClient }) {
  const queries = useQueryClient();

  const [online, setOnline] = useState(
    () => navigator.onLine
  );

  const unavailable = useSyncExternalStore(
    client.onConnectionChange,
    client.connectionUnavailable
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const disconnected = !online || unavailable;

  if (!disconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />

      <span>
        {!online
          ? 'You are offline. Check your internet connection.'
          : 'School server unavailable. Please try again shortly.'}
      </span>

      {online && unavailable && (
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() =>
            void queries.refetchQueries({ type: 'active' })
          }
        >
          Retry
        </button>
      )}
    </div>
  );
}
