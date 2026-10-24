import { tourTailHalfWidth, tourTailInset } from './tour-appearance';
import type { Rectangle } from './tour-position';

/** A broad, asymmetric horn joined inside the bubble border and aimed at the real control. */
export function tourTail(target: Rectangle, bubble: Rectangle): string | null {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  const vertical = bubble.left >= target.right || bubble.right <= target.left;
  let point: (distance: number, offset: number) => string;
  let distance: number;
  let offset: number;
  if (vertical) {
    if (bubble.bottom - bubble.top < tourTailInset * 2) return null;
    const right = bubble.left >= target.right;
    const edge = right ? bubble.left + 1 : bubble.right - 1;
    const tipY = (target.top + target.bottom) / 2;
    const y = clamp(tipY + 10, bubble.top + tourTailInset, bubble.bottom - tourTailInset);
    const tipX = right ? target.right + 4 : target.left - 4;
    distance = right ? edge - tipX : tipX - edge;
    offset = tipY - y;
    point = (d, v) => `${edge + (right ? -d : d)} ${y + v}`;
  } else if (bubble.top >= target.bottom || bubble.bottom <= target.top) {
    if (bubble.right - bubble.left < tourTailInset * 2) return null;
    const below = bubble.top >= target.bottom;
    const edge = below ? bubble.top + 1 : bubble.bottom - 1;
    const tipX = (target.left + target.right) / 2;
    const x = clamp(tipX + 10, bubble.left + tourTailInset, bubble.right - tourTailInset);
    const tipY = below ? target.bottom + 4 : target.top - 4;
    distance = below ? edge - tipY : tipY - edge;
    offset = tipX - x;
    point = (d, v) => `${x + v} ${edge + (below ? -d : d)}`;
  } else {
    return null;
  }
  if (distance <= 0) return null;
  const half = tourTailHalfWidth;
  return `M ${point(0, -half)} C ${point(distance * 0.2, -half + 2)} ${point(distance * 0.55, offset - 3)} ${point(distance, offset)} C ${point(distance * 0.82, offset + 8)} ${point(distance * 0.2, half)} ${point(0, half)}`;
}
