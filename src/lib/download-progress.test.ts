import { expect, it, vi } from 'vitest';
import { readDownload } from './download-progress';

it('reports received bytes, including split UTF-8, and completes after valid JSON', async () => {
  const bytes = new TextEncoder().encode('{"name":"ሀ"}');
  const progress = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 10));
      controller.enqueue(bytes.slice(10));
      controller.close();
    },
  });
  expect(
    await readDownload(
      new Response(stream, { headers: { 'Content-Length': String(bytes.length) } }),
      progress,
      new AbortController().signal,
    ),
  ).toEqual({ name: 'ሀ' });
  expect(progress).toHaveBeenCalledWith(10, bytes.length);
  expect(progress).toHaveBeenLastCalledWith(bytes.length, bytes.length);
});

it('does not invent a percentage for compressed responses or accept broken JSON', async () => {
  const progress = vi.fn();
  await expect(
    readDownload(
      new Response('{broken', { headers: { 'Content-Length': '2', 'Content-Encoding': 'gzip' } }),
      progress,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(progress.mock.calls.every((call) => call[1] === null)).toBe(true);
});

it('cancels a stalled stream when the request is aborted', async () => {
  const cancel = vi.fn();
  const controller = new AbortController();
  const result = readDownload(
    new Response(new ReadableStream({ cancel })),
    vi.fn(),
    controller.signal,
  );
  controller.abort();
  await expect(result).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
});
