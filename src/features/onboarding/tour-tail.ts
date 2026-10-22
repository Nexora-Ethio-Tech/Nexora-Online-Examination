import type { Rectangle } from './tour-position';

/** A curved speech-bubble tail pointing at the nearest edge of the real target. */
export function tourTail(target: Rectangle, bubble: Rectangle): string | null {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  const vertical = bubble.left >= target.right || bubble.right <= target.left;
  if (vertical) {
    const right = bubble.left >= target.right;
    const edge = right ? bubble.left + 1 : bubble.right - 1;
    const y = clamp((target.top + target.bottom) / 2, bubble.top + 28, bubble.bottom - 28);
    const tipX = right ? target.right + 4 : target.left - 4;
    const tipY = clamp(y, target.top + 4, target.bottom - 4);
    return `M ${edge} ${y - 10} Q ${edge} ${y} ${tipX} ${tipY} Q ${edge} ${y + 6} ${edge} ${y + 10}`;
  }
  if (bubble.top >= target.bottom || bubble.bottom <= target.top) {
    const below = bubble.top >= target.bottom;
    const edge = below ? bubble.top + 1 : bubble.bottom - 1;
    const x = clamp((target.left + target.right) / 2, bubble.left + 28, bubble.right - 28);
    const tipY = below ? target.bottom + 4 : target.top - 4;
    const tipX = clamp(x, target.left + 4, target.right - 4);
    return `M ${x - 10} ${edge} Q ${x} ${edge} ${tipX} ${tipY} Q ${x + 6} ${edge} ${x + 10} ${edge}`;
  }
  return null;
}
