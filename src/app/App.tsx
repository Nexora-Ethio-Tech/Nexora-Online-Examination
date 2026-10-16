import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { flushSync } from 'react-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ApiClient } from '@/lib/api-client';
import { ApiProvider } from '@/lib/ApiProvider';
import { createAppRouter } from './router';

type Props = {
  client: ApiClient;
  demo?: boolean;
  router: ReturnType<typeof createAppRouter>;
  queryClient?: QueryClient;
};
export function App({ client, demo = false, router, queryClient }: Props) {
  const [queries] = useState(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={queries}>
      <ApiProvider client={client}>
        <AuthProvider client={client}>
          {import.meta.env.DEV && demo ? (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-xs leading-relaxed text-amber-950">
              Development demo · No real school accounts. IDs: DEMO-STUDENT, DEMO-TEACHER,
              DEMO-ADMIN · Password: NexoraDemo! · MFA: 123456
            </div>
          ) : null}
          <RouterProvider
            router={router}
            flushSync={(callback) => {
              flushSync(callback);
              return undefined;
            }}
          />
        </AuthProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}
