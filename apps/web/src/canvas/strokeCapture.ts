import { CANVAS_BACKGROUND, type BrushSize, type Tool } from '@kritzel/shared';
import { randomId } from '../store/identity.js';
import { applyLocalOp, drawOp, send } from '../store/session.js';
import { isFarEnough, POINT_BATCH_MS, type Point } from './geometry.js';

/**
 * The stroke the drawer is drawing right now (spec 003, "Capture"). Points are
 * drawn on the own canvas at once and sent to the server in batches.
 */
interface ActiveStroke {
  id: string;
  last: Point;
  /** Points drawn locally but not sent yet, as a flat list. */
  unsent: number[];
  timer: number;
}

let active: ActiveStroke | null = null;

function flush(stroke: ActiveStroke): void {
  if (stroke.unsent.length === 0) return;
  send({ type: 'draw.op', op: { type: 'stroke.points', id: stroke.id, points: stroke.unsent } });
  stroke.unsent = [];
}

export function isStrokeActive(): boolean {
  return active !== null;
}

export function beginStroke(point: Point, tool: Tool, color: string, size: BrushSize): boolean {
  endStroke();
  const id = randomId(6);
  const started = drawOp({
    type: 'stroke.start',
    id,
    tool,
    color: tool === 'eraser' ? CANVAS_BACKGROUND : color,
    size,
    x: point.x,
    y: point.y,
  });
  if (!started) return false;
  const stroke: ActiveStroke = { id, last: point, unsent: [], timer: 0 };
  stroke.timer = window.setInterval(() => flush(stroke), POINT_BATCH_MS);
  active = stroke;
  return true;
}

export function extendStroke(point: Point): void {
  const stroke = active;
  if (!stroke || !isFarEnough(stroke.last, point)) return;
  const op = { type: 'stroke.points', id: stroke.id, points: [point.x, point.y] } as const;
  if (!applyLocalOp(op)) {
    // The stroke is full or no longer the open one: finish what was drawn.
    endStroke();
    return;
  }
  stroke.last = point;
  stroke.unsent.push(point.x, point.y);
}

/** Sends what is left of the stroke and finishes it. Safe to call without a stroke. */
export function endStroke(): void {
  const stroke = active;
  if (!stroke) return;
  active = null;
  window.clearInterval(stroke.timer);
  flush(stroke);
  // When the stroke is no longer the open one (a rejoin replaced the op log), there is nothing to end.
  const end = { type: 'stroke.end', id: stroke.id } as const;
  if (applyLocalOp(end)) send({ type: 'draw.op', op: end });
}

/** Drops the stroke without telling the server, which ends it itself at turn end. */
export function abandonStroke(): void {
  if (!active) return;
  window.clearInterval(active.timer);
  active = null;
}
