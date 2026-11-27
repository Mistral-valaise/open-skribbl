import { describe, expect, it } from 'vitest';
import { DRAW_LIMITS } from './constants.js';
import { applyOp, drawOpSchema, EMPTY_OP_LOG, reduceOps, type DrawOp } from './drawing.js';

const stroke = (id: string): DrawOp[] => [
  { type: 'stroke.start', id, tool: 'brush', color: '#14151C', size: 8, x: 10, y: 10 },
  { type: 'stroke.points', id, points: [20, 20, 30, 30] },
  { type: 'stroke.end', id },
];
const ids = (ops: DrawOp[]) =>
  reduceOps(ops).items.map((item) => (item.kind === 'stroke' ? item.id : item.kind));

describe('op log (spec 003)', () => {
  it('AC-003-04: undo removes the latest item and redo restores it', () => {
    expect(ids([...stroke('A'), ...stroke('B'), { type: 'undo' }])).toEqual(['A']);
    expect(ids([...stroke('A'), ...stroke('B'), { type: 'undo' }, { type: 'redo' }])).toEqual([
      'A',
      'B',
    ]);
  });

  it('AC-003-05: a new item empties the redo stack', () => {
    expect(ids([...stroke('A'), { type: 'undo' }, ...stroke('C'), { type: 'redo' }])).toEqual([
      'C',
    ]);
  });

  it('AC-003-06: clear is undoable', () => {
    expect(ids([...stroke('A'), { type: 'clear' }])).toEqual(['A', 'clear']);
    expect(ids([...stroke('A'), { type: 'clear' }, { type: 'undo' }])).toEqual(['A']);
  });

  it('AC-003-07: undo on an empty canvas and redo on an empty stack change nothing', () => {
    expect(ids([{ type: 'undo' }])).toEqual([]);
    expect(ids([...stroke('A'), { type: 'redo' }])).toEqual(['A']);
  });

  it('AC-003-03: coordinates outside the canvas, unknown sizes and malformed colours fail validation', () => {
    const valid = {
      type: 'stroke.start',
      id: 'a',
      tool: 'brush',
      color: '#14151C',
      size: 8,
      x: 1,
      y: 1,
    };
    expect(drawOpSchema.safeParse(valid).success).toBe(true);
    expect(drawOpSchema.safeParse({ ...valid, x: 801 }).success).toBe(false);
    expect(drawOpSchema.safeParse({ ...valid, y: -1 }).success).toBe(false);
    expect(drawOpSchema.safeParse({ ...valid, x: 1.5 }).success).toBe(false);
    expect(drawOpSchema.safeParse({ ...valid, size: 9 }).success).toBe(false);
    expect(drawOpSchema.safeParse({ ...valid, color: 'red' }).success).toBe(false);
    expect(
      drawOpSchema.safeParse({ type: 'stroke.points', id: 'a', points: [10, 601] }).success,
    ).toBe(false);
    expect(drawOpSchema.safeParse({ type: 'fill', x: 5, y: 5, color: '#12345' }).success).toBe(
      false,
    );
  });

  it('AC-003-10: a stroke beyond 5,000 points and an item beyond 2,000 are rejected', () => {
    let log = reduceOps([stroke('A')[0]!]);
    const chunk = Array.from({ length: 4_998 }, () => [5, 5]).flat();
    const filled = applyOp(log, { type: 'stroke.points', id: 'A', points: chunk });
    expect(filled.ok).toBe(true);
    if (filled.ok) log = filled.log;
    expect(applyOp(log, { type: 'stroke.points', id: 'A', points: [1, 1, 2, 2] })).toEqual({
      ok: false,
      code: 'drawing_limit',
    });

    let full = EMPTY_OP_LOG;
    for (let index = 0; index < DRAW_LIMITS.itemsPerTurn; index += 1) {
      const next = applyOp(full, { type: 'fill', x: 1, y: 1, color: '#000000' });
      if (next.ok) full = next.log;
    }
    expect(full.items).toHaveLength(DRAW_LIMITS.itemsPerTurn);
    expect(applyOp(full, { type: 'clear' })).toEqual({ ok: false, code: 'drawing_limit' });
  });

  it('points for a stroke that is not open are rejected', () => {
    const log = reduceOps(stroke('A'));
    expect(applyOp(log, { type: 'stroke.points', id: 'A', points: [1, 1] }).ok).toBe(false);
    expect(applyOp(log, { type: 'stroke.end', id: 'B' }).ok).toBe(false);
  });

  it('tracks the point count across undo and redo', () => {
    const log = reduceOps([...stroke('A'), ...stroke('B')]);
    expect(log.pointCount).toBe(6);
    expect(reduceOps([{ type: 'undo' }], log).pointCount).toBe(3);
  });
});
