const requests = new Map<string, Set<{ signal: AbortSignal; done: Promise<void> }>>();
export async function acquireWriter(attemptId: string, signal: AbortSignal): Promise<() => void> {
  if (!navigator.locks)
    throw new Error(
      'This browser cannot safely coordinate exam tabs. Use an up-to-date browser; editing is disabled here.',
    );
  // Wait for cancelled owners to finish releasing during a development remount
  // or a real reopen. Never wait for, or steal from, an active owner.
  const group = requests.get(attemptId) ?? new Set<{ signal: AbortSignal; done: Promise<void> }>();
  requests.set(attemptId, group);
  await Promise.all(
    [...group]
      .filter((entry) => entry.signal.aborted)
      .map((entry) => entry.done.catch(() => undefined)),
  );
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let release: (() => void) | undefined;
    const abort = () => {
      release?.();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    const done = navigator.locks
      .request(`nexora-attempt:${attemptId}`, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          signal.removeEventListener('abort', abort);
          reject(
            new Error('This exam is open in another tab. Close that tab before continuing here.'),
          );
          return;
        }
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        await new Promise<void>((done) => {
          release = done;
          resolve(done);
        });
        signal.removeEventListener('abort', abort);
      })
      .catch(reject)
      .then(() => undefined);
    const entry = { signal, done };
    group.add(entry);
    void done.finally(() => {
      group.delete(entry);
      if (!group.size && requests.get(attemptId) === group) requests.delete(attemptId);
    });
  });
}
