import { expect, it } from 'vitest';
import { tourTail } from './tour-tail';

const bubble = { left: 300, right: 684, top: 200, bottom: 520 };
it.each([
  { target: { left: 150, right: 268, top: 300, bottom: 344 }, tip: '272 322' },
  { target: { left: 716, right: 816, top: 300, bottom: 344 }, tip: '712 322' },
  { target: { left: 400, right: 500, top: 120, bottom: 168 }, tip: '450 172' },
  { target: { left: 400, right: 500, top: 552, bottom: 600 }, tip: '450 548' },
])('joins the rounded bubble to a tip four pixels outside $tip', ({ target, tip }) => {
  const path = tourTail(target, bubble);
  expect(path).toContain(` ${tip} C `);
  expect(path).not.toMatch(/NaN|Infinity/);
});

it('hides the tail when there is no separate target or no space beyond the curved corners', () => {
  expect(tourTail(bubble, bubble)).toBeNull();
  expect(
    tourTail(
      { left: 10, right: 50, top: 10, bottom: 30 },
      { left: 82, right: 300, top: 8, bottom: 90 },
    ),
  ).toBeNull();
});
