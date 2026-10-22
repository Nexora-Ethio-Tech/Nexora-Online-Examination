export type DownloadProgress = (loaded: number, total: number | null) => void;

/** Counts received response bytes; compressed/unknown lengths stay indeterminate. */
export async function readDownload(
  response: Response,
  progress: DownloadProgress,
  signal: AbortSignal,
): Promise<unknown> {
  const length = Number(response.headers.get('Content-Length'));
  const total =
    !response.headers.get('Content-Encoding') && Number.isSafeInteger(length) && length > 0
      ? length
      : null;
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  let loaded = 0;
  let text = '';
  const decoder = new TextDecoder();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    progress(0, total);
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      loaded += chunk.value.byteLength;
      text += decoder.decode(chunk.value, { stream: true });
      progress(loaded, total && loaded <= total ? total : null);
    }
    text += decoder.decode();
    const result: unknown = JSON.parse(text);
    progress(loaded, loaded);
    return result;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
