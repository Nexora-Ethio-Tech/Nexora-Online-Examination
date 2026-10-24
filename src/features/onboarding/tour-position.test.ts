import { expect, it } from 'vitest';
import { tourPosition } from './tour-position';

it.each([
  { width: 1366, height: 900, target: { left: 12, right: 230, top: 200, bottom: 245 } },
  { width: 360, height: 800, target: { left: 16, right: 60, top: 16, bottom: 60 } },
  { width: 360, height: 800, target: { left: 16, right: 250, top: 300, bottom: 345 } },
  { width: 800, height: 360, target: { left: 16, right: 350, top: 120, bottom: 165 } },
  { width: 1366, height: 900, target: { left: 1200, right: 1310, top: 10, bottom: 54 } },
  { width: 360, height: 800, target: { left: 170, right: 270, top: 720, bottom: 764 } },
])('keeps the guide in free viewport space at $width x $height', ({ target, width, height }) => {
  const p = tourPosition(target, { width, height });
  expect(p.width).toBeGreaterThanOrEqual(250);
  expect(p.maxHeight).toBeGreaterThan(100);
  expect(p.left).toBeGreaterThanOrEqual(8);
  expect(p.top).toBeGreaterThanOrEqual(8);
  expect(p.left + p.width).toBeLessThanOrEqual(width - 8);
  expect(p.top + p.maxHeight).toBeLessThanOrEqual(height - 8);
  expect(
    p.left >= target.right ||
      p.left + p.width <= target.left ||
      p.top >= target.bottom ||
      p.top + p.maxHeight <= target.top,
  ).toBe(true);
});

it('keeps short bubbles close to a control near the bottom-right corner', () => {
  const target = { left: 650, right: 780, top: 530, bottom: 574 };
  const position = tourPosition(target, { width: 800, height: 600 }, 180);
  expect(position.left + position.width).toBe(target.left - 32);
  expect(position.top + 180).toBeLessThanOrEqual(592);
  expect(position.top).toBeGreaterThan(350);
});
