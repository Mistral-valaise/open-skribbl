import { z } from './zod.js';
import { BRUSH_SIZES, CANVAS_HEIGHT, CANVAS_WIDTH, DRAW_LIMITS } from './constants.js';

/**
 * Drawing model (spec 003): ops sent by the drawer and the effective items
 * they reduce to. Server and clients run the same `applyOp`, so everyone
 * arrives at the same items.
 */

const x = z.number().int().min(0).max(CANVAS_WIDTH);
const y = z.number().int().min(0).max(CANVAS_HEIGHT);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const size = z.union(BRUSH_SIZES.map((value) => z.literal(value)));
const strokeId = z.string().min(1).max(24);

const flatPoints = z
  .array(z.number().int().min(0))
  .min(2)
  .max(DRAW_LIMITS.pointsPerStroke * 2)
  .refine((values) => values.length % 2 === 0, 'points must be x,y pairs')
  .refine(
    (values) =>
      values.every((value, index) => value <= (index % 2 === 0 ? CANVAS_WIDTH : CANVAS_HEIGHT)),
    'point outside the canvas',
  );

export const drawOpSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stroke.start'),
    id: strokeId,
    tool: z.enum(['brush', 'eraser']),
    color,
    size,
    x,
    y,
  }),
  z.object({ type: z.literal('stroke.points'), id: strokeId, points: flatPoints }),
  z.object({ type: z.literal('stroke.end'), id: strokeId }),
  z.object({ type: z.literal('fill'), x, y, color }),
  z.object({ type: z.literal('clear') }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('redo') }),
]);

export type DrawOp = z.infer<typeof drawOpSchema>;
export type Tool = 'brush' | 'eraser';
export type BrushSize = (typeof BRUSH_SIZES)[number];

export interface StrokeItem {
  kind: 'stroke';
  id: string;
  tool: Tool;
  color: string;
  size: BrushSize;
  /** Flat list: x0, y0, x1, y1, … */
  points: readonly number[];
  done: boolean;
}
export interface FillItem {
  kind: 'fill';
  x: number;
  y: number;
  color: string;
}
export interface ClearItem {
  kind: 'clear';
}
export type DrawItem = StrokeItem | FillItem | ClearItem;

export interface OpLog {
  /** Effective items, in drawing order. */
  readonly items: readonly DrawItem[];
  /** Undone items; the last one is restored first. */
  readonly redo: readonly DrawItem[];
  /** Total stroke points in `items`. */
  readonly pointCount: number;
}

export const EMPTY_OP_LOG: OpLog = { items: [], redo: [], pointCount: 0 };

export type ApplyOpResult =
  { ok: true; log: OpLog } | { ok: false; code: 'drawing_limit' | 'invalid_op' };

const pointsOf = (item: DrawItem) => (item.kind === 'stroke' ? item.points.length / 2 : 0);

function openStroke(log: OpLog): StrokeItem | null {
  const last = log.items[log.items.length - 1];
  return last?.kind === 'stroke' && !last.done ? last : null;
}

/** Ends a stroke that is still being drawn (turn end, disconnect, next item). */
export function finishOpenStroke(log: OpLog): OpLog {
  const open = openStroke(log);
  if (!open) return log;
  return { ...log, items: [...log.items.slice(0, -1), { ...open, done: true }] };
}

function addItem(log: OpLog, item: DrawItem): ApplyOpResult {
  const base = finishOpenStroke(log);
  if (base.items.length >= DRAW_LIMITS.itemsPerTurn) return { ok: false, code: 'drawing_limit' };
  const pointCount = base.pointCount + pointsOf(item);
  if (pointCount > DRAW_LIMITS.pointsPerTurn) return { ok: false, code: 'drawing_limit' };
  return { ok: true, log: { items: [...base.items, item], redo: [], pointCount } };
}

export function applyOp(log: OpLog, op: DrawOp): ApplyOpResult {
  switch (op.type) {
    case 'stroke.start':
      return addItem(log, {
        kind: 'stroke',
        id: op.id,
        tool: op.tool,
        color: op.color,
        size: op.size,
        points: [op.x, op.y],
        done: false,
      });
    case 'stroke.points': {
      const open = openStroke(log);
      if (!open || open.id !== op.id) return { ok: false, code: 'invalid_op' };
      const added = op.points.length / 2;
      if (open.points.length / 2 + added > DRAW_LIMITS.pointsPerStroke) {
        return { ok: false, code: 'drawing_limit' };
      }
      if (log.pointCount + added > DRAW_LIMITS.pointsPerTurn) {
        return { ok: false, code: 'drawing_limit' };
      }
      const stroke = { ...open, points: [...open.points, ...op.points] };
      return {
        ok: true,
        log: {
          ...log,
          items: [...log.items.slice(0, -1), stroke],
          pointCount: log.pointCount + added,
        },
      };
    }
    case 'stroke.end': {
      const open = openStroke(log);
      if (!open || open.id !== op.id) return { ok: false, code: 'invalid_op' };
      return { ok: true, log: finishOpenStroke(log) };
    }
    case 'fill':
      return addItem(log, { kind: 'fill', x: op.x, y: op.y, color: op.color });
    case 'clear':
      return addItem(log, { kind: 'clear' });
    case 'undo': {
      const base = finishOpenStroke(log);
      const last = base.items[base.items.length - 1];
      if (!last) return { ok: true, log: base };
      return {
        ok: true,
        log: {
          items: base.items.slice(0, -1),
          redo: [...base.redo, last],
          pointCount: base.pointCount - pointsOf(last),
        },
      };
    }
    case 'redo': {
      const base = finishOpenStroke(log);
      const restored = base.redo[base.redo.length - 1];
      if (!restored) return { ok: true, log: base };
      return {
        ok: true,
        log: {
          items: [...base.items, restored],
          redo: base.redo.slice(0, -1),
          pointCount: base.pointCount + pointsOf(restored),
        },
      };
    }
  }
}

/** Reduces a list of ops to an op log, skipping rejected ops. */
export function reduceOps(ops: readonly DrawOp[], start: OpLog = EMPTY_OP_LOG): OpLog {
  return ops.reduce((log, op) => {
    const result = applyOp(log, op);
    return result.ok ? result.log : log;
  }, start);
}
