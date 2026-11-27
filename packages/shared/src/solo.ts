import { CANVAS_HEIGHT, CANVAS_WIDTH, SCORING, SOLO } from './constants.js';
import type { StrokeItem } from './drawing.js';

/**
 * Solo mode rules (spec 009): scoring, fitting a dataset drawing onto the
 * canvas, and the replay that redraws it at constant pen speed.
 */

/** A dataset drawing: strokes as flat lists x0, y0, x1, y1, … */
export type SoloDrawing = readonly (readonly number[])[];

/** points = 100 + floor(400 × remaining / 30 s); no first-guess bonus. */
export function soloPoints(remainingMs: number): number {
  const remaining = Math.min(Math.max(remainingMs, 0), SOLO.timePerDrawingMs);
  return SCORING.base + Math.floor((SCORING.timeBonus * remaining) / SOLO.timePerDrawingMs);
}

/** Scales a drawing to the canvas, centred, with the margin kept free on every side. */
export function fitDrawing(drawing: SoloDrawing): number[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of drawing) {
    for (let index = 0; index < stroke.length; index += 2) {
      minX = Math.min(minX, stroke[index]!);
      maxX = Math.max(maxX, stroke[index]!);
      minY = Math.min(minY, stroke[index + 1]!);
      maxY = Math.max(maxY, stroke[index + 1]!);
    }
  }
  if (minX === Infinity) return [];
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min(
    (CANVAS_WIDTH * (1 - 2 * SOLO.margin)) / width,
    (CANVAS_HEIGHT * (1 - 2 * SOLO.margin)) / height,
  );
  const offsetX = (CANVAS_WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = (CANVAS_HEIGHT - (maxY - minY) * scale) / 2;
  return drawing.map((stroke) =>
    stroke.map((value, index) =>
      Math.round(
        index % 2 === 0 ? (value - minX) * scale + offsetX : (value - minY) * scale + offsetY,
      ),
    ),
  );
}

interface PlannedStroke {
  points: readonly number[];
  /** Cumulative path length at each point. */
  lengths: number[];
  startMs: number;
  endMs: number;
}

export interface ReplayPlan {
  strokes: PlannedStroke[];
  durationMs: number;
}

/**
 * Plans a replay: the pen moves at constant speed along the strokes, pauses
 * between them, and finishes exactly at `durationMs`.
 */
export function planReplay(
  strokes: readonly (readonly number[])[],
  durationMs: number = SOLO.replayMs,
  pauseMs: number = SOLO.strokePauseMs,
): ReplayPlan {
  const measured = strokes
    .filter((points) => points.length >= 2)
    .map((points) => {
      const lengths = [0];
      for (let index = 2; index < points.length; index += 2) {
        const dx = points[index]! - points[index - 2]!;
        const dy = points[index + 1]! - points[index - 1]!;
        lengths.push(lengths[lengths.length - 1]! + Math.hypot(dx, dy));
      }
      return { points, lengths };
    });
  const gaps = Math.max(measured.length - 1, 0);
  // Pauses never take more than half of the replay.
  const pause = gaps === 0 ? 0 : Math.min(pauseMs, durationMs / 2 / gaps);
  const drawMs = durationMs - pause * gaps;
  const total = measured.reduce(
    (sum, stroke) => sum + stroke.lengths[stroke.lengths.length - 1]!,
    0,
  );

  let cursor = 0;
  const planned = measured.map((stroke, index) => {
    const length = stroke.lengths[stroke.lengths.length - 1]!;
    const share = total > 0 ? (length / total) * drawMs : drawMs / measured.length;
    const startMs = cursor;
    const endMs = index === measured.length - 1 ? durationMs : startMs + share;
    cursor = endMs + pause;
    return { ...stroke, startMs, endMs };
  });
  return { strokes: planned, durationMs };
}

/** The strokes visible `elapsedMs` into the replay, as drawable items. */
export function replayAt(plan: ReplayPlan, elapsedMs: number): StrokeItem[] {
  const items: StrokeItem[] = [];
  plan.strokes.forEach((stroke, strokeIndex) => {
    if (elapsedMs < stroke.startMs) return;
    const total = stroke.lengths[stroke.lengths.length - 1]!;
    const done = elapsedMs >= stroke.endMs;
    const span = stroke.endMs - stroke.startMs;
    const reached = done || span <= 0 ? total : ((elapsedMs - stroke.startMs) / span) * total;

    const points: number[] = [stroke.points[0]!, stroke.points[1]!];
    for (let index = 1; index < stroke.lengths.length; index += 1) {
      const x = stroke.points[index * 2]!;
      const y = stroke.points[index * 2 + 1]!;
      if (stroke.lengths[index]! <= reached) {
        points.push(x, y);
        continue;
      }
      const previous = stroke.lengths[index - 1]!;
      const fraction = (reached - previous) / (stroke.lengths[index]! - previous);
      const fromX = stroke.points[index * 2 - 2]!;
      const fromY = stroke.points[index * 2 - 1]!;
      points.push(
        Math.round(fromX + (x - fromX) * fraction),
        Math.round(fromY + (y - fromY) * fraction),
      );
      break;
    }
    items.push({
      kind: 'stroke',
      id: `replay-${strokeIndex}`,
      tool: 'brush',
      color: SOLO.color,
      size: SOLO.brushSize,
      points,
      done,
    });
  });
  return items;
}
