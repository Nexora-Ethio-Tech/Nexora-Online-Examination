import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import type { ApiClient } from '@/lib/api-client';
export function ConnectionStatus({ client }: { client: ApiClient }) {
  const queries = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const unavailable = useSyncExternalStore(client.onConnectionChange, client.connectionUnavailable);
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
  return (
    <div
      role="status"
      className={`connection-status sticky top-0 z-40 flex min-h-8 items-center justify-center gap-2 border-b px-3 py-1 text-xs ${disconnected ? 'bg-amber-50 text-amber-950' : 'bg-background text-muted-foreground'}`}
    >
      {disconnected ? (
        <WifiOff className="size-3" aria-hidden="true" />
      ) : (
        <Wifi className="size-3" aria-hidden="true" />
      )}
      {!online
        ? 'Offline · reconnect to load or send changes'
        : unavailable
          ? 'School server unavailable · try again shortly'
          : 'Online'}
      {online && unavailable && (
        <button
          type="button"
          className="min-h-6 underline"
          onClick={() => void queries.refetchQueries({ type: 'active' })}
        >
          Retry connection
        </button>
      )}
    </div>
  );
}
