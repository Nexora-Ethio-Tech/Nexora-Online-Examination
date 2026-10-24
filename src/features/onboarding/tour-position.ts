import { tourGap } from './tour-appearance';

export type Rectangle = { left: number; top: number; right: number; bottom: number };
/** Choose free space beside a target, never clamp the popup back over it. */
export function tourPosition(
  target: Rectangle,
  viewport: { width: number; height: number },
  contentHeight = 320,
) {
  const gap = tourGap,
    margin = 8;
  const areas = [
    {
      left: target.right + gap,
      top: margin,
      right: viewport.width - margin,
      bottom: viewport.height - margin,
    },
    { left: margin, top: margin, right: target.left - gap, bottom: viewport.height - margin },
    {
      left: margin,
      top: target.bottom + gap,
      right: viewport.width - margin,
      bottom: viewport.height - margin,
    },
    { left: margin, top: margin, right: viewport.width - margin, bottom: target.top - gap },
  ].map((area) => ({
    ...area,
    width: Math.max(0, Math.min(384, area.right - area.left)),
    height: Math.max(0, area.bottom - area.top),
  }));
  const best = areas.sort(
    (a, b) =>
      Math.min(b.width / 300, 1) * Math.min(b.height / contentHeight, 1) -
      Math.min(a.width / 300, 1) * Math.min(a.height / contentHeight, 1),
  )[0];
  if (!best) throw new Error('Tour placement needs a candidate area');
  const beside = best.left >= target.right || best.right <= target.left;
  const height = Math.min(contentHeight, best.height);
  const top = beside
    ? Math.max(margin, Math.min((target.top + target.bottom - height) / 2, best.bottom - height))
    : best.bottom <= target.top
      ? best.bottom - height
      : best.top;
  const left = beside
    ? best.right <= target.left
      ? best.right - best.width
      : best.left
    : Math.max(
        margin,
        Math.min((target.left + target.right - best.width) / 2, best.right - best.width),
      );
  return { left, top, width: best.width, maxHeight: Math.max(0, best.bottom - top) };
}
