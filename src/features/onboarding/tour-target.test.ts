import { afterEach, expect, it, vi } from 'vitest';
import { tourTarget } from './tour-target';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function layout(markup: string) {
  document.body.innerHTML = markup;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(20, 20, 100, 44),
  );
}

it('prefers the visible feature over its page link, then retargets when it appears', () => {
  layout('<nav><a href="/teacher">My papers</a></nav><button id="import" hidden>Upload</button>');
  const step = { target: '#import', fallbackTarget: 'nav a' };
  expect(tourTarget(step)?.kind).toBe('navigation');
  document.getElementById('import')?.removeAttribute('hidden');
  expect(tourTarget(step)?.element.id).toBe('import');
  expect(tourTarget(step)?.kind).toBe('feature');
});

it('honors feature priority instead of document order and ignores hidden controls', () => {
  layout('<button id="tab">Questions</button><input id="upload" style="visibility:hidden">');
  const step = { target: ['#upload', '#tab'] };
  expect(tourTarget(step)?.element.id).toBe('tab');
  document.getElementById('upload')?.removeAttribute('style');
  expect(tourTarget(step)?.element.id).toBe('upload');
});

it('uses the open navigation menu instead of pointing behind its focus layer', () => {
  layout(
    '<button id="feature">New exam</button><aside data-tour-menu><nav><a href="/teacher">Papers</a></nav></aside>',
  );
  expect(tourTarget({ target: '#feature', fallbackTarget: 'nav a' })?.kind).toBe('navigation');
});

it('only points to mobile Navigation for steps with a navigation destination', () => {
  layout('<button data-tour-navigation>Navigation</button>');
  expect(tourTarget({ target: '#absent' })).toBeNull();
  expect(tourTarget({ target: '#absent', fallbackTarget: 'nav a' })?.kind).toBe('menu');
});
