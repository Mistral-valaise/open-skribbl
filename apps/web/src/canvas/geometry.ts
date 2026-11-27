import { CANVAS_HEIGHT, CANVAS_WIDTH, CAPTURE } from '@kritzel/shared';

/** Capture rule (spec 003): points closer than this to the previous one are dropped. */
export const MIN_POINT_DISTANCE = CAPTURE.minPointDistance;
/** Capture rule (spec 003): stroke points are sent in batches at this interval. */
export const POINT_BATCH_MS = CAPTURE.batchMs;

export interface Point {
  x: number;
  y: number;
}

/** The on-screen box of the canvas, as `getBoundingClientRect()` reports it. */
export interface CanvasBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/** Converts a pointer position to integer logical coordinates inside 0…800 × 0…600. */
export function toLogicalPoint(clientX: number, clientY: number, box: CanvasBox): Point {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp(Math.round(((clientX - box.left) / box.width) * CANVAS_WIDTH), CANVAS_WIDTH),
    y: clamp(Math.round(((clientY - box.top) / box.height) * CANVAS_HEIGHT), CANVAS_HEIGHT),
  };
}

/** Whether `next` is far enough from `previous` to be kept as a stroke point. */
export function isFarEnough(previous: Point, next: Point): boolean {
  return Math.hypot(next.x - previous.x, next.y - previous.y) >= MIN_POINT_DISTANCE;
}
