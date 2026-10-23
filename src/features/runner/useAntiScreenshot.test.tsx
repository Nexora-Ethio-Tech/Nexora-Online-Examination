import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAntiScreenshot } from './useAntiScreenshot';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(['Meta', 'Alt', 'PrintScreen', 'F12'])(
  'blacks out synchronously on %s and gates resume for 1500 ms',
  (key) => {
    const report = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAntiScreenshot({ active: true, strict: true, onInterruption: report }),
    );
    fireEvent.keyDown(window, { key });
    expect(document.documentElement).toHaveClass('nexora-screen-blackout');
    expect(result.current.isBlackedOut).toBe(true);
    act(() => result.current.resume());
    expect(result.current.isBlackedOut).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    act(() => result.current.resume());
    expect(result.current.isBlackedOut).toBe(false);
    expect(report).toHaveBeenCalled();
    unmount();
    expect(document.documentElement).not.toHaveClass('nexora-screen-blackout');
  },
);

it('locks resume after five episodes without repeatedly counting the same episode', () => {
  const limit = vi.fn();
  const { result, unmount } = renderHook(() =>
    useAntiScreenshot({ active: true, maxIncidents: 5, onLimitReached: limit }),
  );
  for (let count = 1; count <= 5; count++) {
    fireEvent.blur(window);
    fireEvent.blur(window);
    expect(result.current.warningCount).toBe(count);
    act(() => vi.advanceTimersByTime(1500));
    act(() => result.current.resume());
  }
  expect(result.current.limitReached).toBe(true);
  expect(result.current.isBlackedOut).toBe(true);
  expect(limit).toHaveBeenCalledOnce();
  unmount();
});

it('blacks out when the pointer leaves a desktop window', () => {
  const { result, unmount } = renderHook(() => useAntiScreenshot({ active: true, strict: true }));
  fireEvent.mouseLeave(document.documentElement);
  expect(result.current.isBlackedOut).toBe(true);
  unmount();
});
