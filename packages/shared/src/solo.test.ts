import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants.js';
import { fitDrawing, planReplay, replayAt, soloPoints } from './solo.js';

describe('solo rules (spec 009)', () => {
  it('AC-009-05: a correct guess with 15 s remaining scores 300, at the first instant 500', () => {
    expect(soloPoints(15_000)).toBe(300);
    expect(soloPoints(30_000)).toBe(500);
    expect(soloPoints(0)).toBe(100);
  });

  it('AC-009-04: a drawing is centred with at least a 10 % margin and keeps its aspect ratio', () => {
    const wide = fitDrawing([
      [0, 100, 255, 100],
      [0, 150, 255, 150, 128, 200],
    ]);
    const xs = wide.flatMap((stroke) => stroke.filter((_, index) => index % 2 === 0));
    const ys = wide.flatMap((stroke) => stroke.filter((_, index) => index % 2 === 1));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(CANVAS_WIDTH * 0.1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(CANVAS_WIDTH * 0.9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(CANVAS_HEIGHT * 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(CANVAS_HEIGHT * 0.9);
    // centred
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(CANVAS_WIDTH, -1);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(CANVAS_HEIGHT, -1);
    // 255 × 100 source box keeps its ratio
    const ratio = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    expect(ratio).toBeCloseTo(2.55, 1);

    const tall = fitDrawing([[100, 0, 100, 255]]);
    expect(tall[0]![1]).toBeGreaterThanOrEqual(CANVAS_HEIGHT * 0.1);
    expect(tall[0]![3]).toBeLessThanOrEqual(CANVAS_HEIGHT * 0.9);
  });

  it('AC-009-03: the replay draws strokes in order and is complete after the replay duration', () => {
    const strokes = [
      [100, 100, 300, 100],
      [300, 200, 300, 300, 400, 300],
      [500, 500, 500, 510],
    ];
    const plan = planReplay(strokes, 15_000, 150);

    expect(replayAt(plan, 0)).toHaveLength(1);
    const early = replayAt(plan, 1_000);
    expect(early.map((item) => item.id)).toEqual(['replay-0']);
    expect(early[0]!.done).toBe(false);
    expect(early[0]!.points[2]).toBeGreaterThan(100);
    expect(early[0]!.points[2]).toBeLessThan(300);

    const starts = plan.strokes.map((stroke) => stroke.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(plan.strokes[1]!.startMs - plan.strokes[0]!.endMs).toBeCloseTo(150);

    const end = replayAt(plan, 15_000);
    expect(end.every((item) => item.done)).toBe(true);
    expect(end.map((item) => item.points)).toEqual(strokes);
    expect(replayAt(plan, 14_400).some((item) => !item.done)).toBe(true);
  });

  it('moves the pen at constant speed across strokes', () => {
    const plan = planReplay(
      [
        [0, 0, 100, 0],
        [0, 50, 300, 50],
      ],
      4_150,
      150,
    );
    const [short, long] = plan.strokes;
    expect(short!.endMs - short!.startMs).toBeCloseTo(1_000);
    expect(long!.endMs - long!.startMs).toBeCloseTo(3_000);
  });

  it('handles drawings with many strokes without negative draw time', () => {
    const strokes = Array.from({ length: 80 }, (_, index) => [index, 0, index, 10]);
    const plan = planReplay(strokes, 15_000, 150);
    expect(plan.strokes.every((stroke) => stroke.endMs >= stroke.startMs)).toBe(true);
    expect(replayAt(plan, 15_000)).toHaveLength(80);
  });
});
