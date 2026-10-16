import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './api-client';
const Context = createContext<ApiClient | null>(null);
export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useApiClient() {
  const client = useContext(Context);
  if (!client) throw new Error('API provider is missing.');
  return client;
}
