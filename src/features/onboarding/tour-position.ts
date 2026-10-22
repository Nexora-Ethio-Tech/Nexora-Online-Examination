export type Rectangle = { left: number; top: number; right: number; bottom: number };
/** Choose free space beside a target, never clamp the popup back over it. */
export function tourPosition(target: Rectangle, viewport: { width: number; height: number }) {
  const gap = 20,
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
      Math.min(b.width / 300, 1) * Math.min(b.height / 320, 1) -
      Math.min(a.width / 300, 1) * Math.min(a.height / 320, 1),
  )[0];
  if (!best) throw new Error('Tour placement needs a candidate area');
  const beside = best.left >= target.right || best.right <= target.left;
  const top = beside
    ? Math.max(margin, Math.min(target.top, viewport.height - margin - Math.min(320, best.height)))
    : best.top;
  return { left: best.left, top, width: best.width, maxHeight: Math.max(0, best.bottom - top) };
}
