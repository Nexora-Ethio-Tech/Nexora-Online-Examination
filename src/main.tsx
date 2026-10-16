import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from '@/app/App';
import { ApiClient, type Transport } from '@/lib/api-client';
import { readEnvironment } from '@/lib/env';
import { createAppRouter } from '@/app/router';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

const environment = readEnvironment({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  useMocks: import.meta.env.MODE === 'demo' ? 'true' : import.meta.env.VITE_USE_MOCKS,
  production: import.meta.env.PROD,
});
async function start(element: HTMLElement) {
  let transport: Transport | undefined;
  if (import.meta.env.DEV && environment.useMocks) {
    const { createDemoTransport } = await import('@/mocks/auth');
    transport = createDemoTransport();
  }
  const client = new ApiClient(environment.baseUrl, transport);
  createRoot(element).render(
    <StrictMode>
      <App client={client} demo={environment.useMocks} router={createAppRouter()} />
    </StrictMode>,
  );
}
void start(container);
