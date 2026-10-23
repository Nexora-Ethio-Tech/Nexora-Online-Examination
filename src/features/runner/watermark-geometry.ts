/**
 * Geometry and label helpers for ExamWatermark.
 *
 * Recreated from how ExamWatermark.tsx uses them:
 *   computeWatermarkOffset(step)  -> { x, y } in px
 *   formatWatermarkLabel(school, studentLoginId, attemptId, timeStr) -> string
 */

export interface WatermarkOffset {
  x: number;
  y: number;
}

/**
 * Deterministic "mathematical jitter". The pattern drifts a little at every step so a
 * cropped or photographed screen never lines up with a clean grid, which makes
 * removing the watermark by image editing harder.
 *
 * Keep |x| and |y| below 40: ExamWatermark oversizes its layer by 40px (-inset-10)
 * so the translate never exposes an unmarked edge.
 */
export function computeWatermarkOffset(step: number): WatermarkOffset {
  const s = Number.isFinite(step) ? step : 0;
  const x = Math.round(18 * Math.sin(s * 1.3) + 8 * Math.cos(s * 0.7)); // max 26
  const y = Math.round(18 * Math.cos(s * 1.1) + 8 * Math.sin(s * 0.9)); // max 26
  return { x, y };
}

/**
 * Compact label printed on the watermark tile, e.g.
 * "NEXORA STU-2026-00123 a1b2c3 23/10 3:45 PM EAT".
 * If your student IDs are long, widen the tile in ExamWatermark (pattern width 340 -> ~460),
 * otherwise the end of the label can be clipped.
 */
export function formatWatermarkLabel(
  schoolName: string,
  studentLoginId: string,
  attemptId: string,
  timeStr: string,
): string {
  const school = (schoolName || 'NEXORA').slice(0, 10).toUpperCase();
  const attempt = attemptId ? attemptId.slice(-6) : '';
  return [school, studentLoginId, attempt, timeStr].filter(Boolean).join(' ');
}
