declare const __APP_BUILD__: string;
export const shellBuild = __APP_BUILD__;
export async function ensureOfflineShell(): Promise<'ready' | 'development'> {
  if (import.meta.env.DEV) return 'development';
  if (!('serviceWorker' in navigator) || !isSecureContext)
    throw new Error('Offline preparation requires HTTPS and a supported browser.');
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker) throw new Error('Offline app installation did not start.');
  if (worker.state !== 'activated')
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener('statechange', check);
        reject(
          new Error(
            'App update is waiting. Finish pending exams and close other Nexora tabs before reopening.',
          ),
        );
      }, 20_000);
      function check() {
        if (worker?.state === 'activated') {
          clearTimeout(timer);
          worker.removeEventListener('statechange', check);
          resolve();
        } else if (worker?.state === 'redundant') {
          clearTimeout(timer);
          worker.removeEventListener('statechange', check);
          reject(new Error('Offline app installation failed.'));
        }
      }
      worker.addEventListener('statechange', check);
      check();
    });
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timer);
      channel.port1.close();
    };
    const timer = window.setTimeout(() => {
      finish();
      reject(new Error('Offline app verification timed out.'));
    }, 15_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      const value = event.data;
      if (
        typeof value === 'object' &&
        value !== null &&
        'version' in value &&
        'ready' in value &&
        value.version === __APP_BUILD__ &&
        value.ready === true
      )
        resolve('ready');
      else
        reject(
          new Error(
            'The offline app version is not ready. Preserve pending exams; close other Nexora tabs before reopening.',
          ),
        );
    };
    worker.postMessage({ type: 'NEXORA_SHELL_CHECK' }, [channel.port2]);
  });
}
