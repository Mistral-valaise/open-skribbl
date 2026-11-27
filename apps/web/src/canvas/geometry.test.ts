import { describe, expect, it } from 'vitest';
import { isFarEnough, toLogicalPoint } from './geometry.js';

describe('toLogicalPoint', () => {
  const box = { left: 100, top: 50, width: 400, height: 300 };

  it('AC-003-14: scales a pointer position on a small canvas to the 800 × 600 logical space', () => {
    expect(toLogicalPoint(100, 50, box)).toEqual({ x: 0, y: 0 });
    expect(toLogicalPoint(300, 200, box)).toEqual({ x: 400, y: 300 });
    expect(toLogicalPoint(500, 350, box)).toEqual({ x: 800, y: 600 });
  });

  it('AC-003-03: never produces a coordinate outside the canvas or a fraction', () => {
    expect(toLogicalPoint(-40, 10, box)).toEqual({ x: 0, y: 0 });
    expect(toLogicalPoint(900, 900, box)).toEqual({ x: 800, y: 600 });
    expect(toLogicalPoint(133.7, 77.3, box)).toEqual({ x: 67, y: 55 });
  });

  it('copes with a canvas that has no size yet', () => {
    expect(toLogicalPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('isFarEnough', () => {
  it('drops points closer than 2 logical pixels to the previous one', () => {
    expect(isFarEnough({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
    expect(isFarEnough({ x: 10, y: 10 }, { x: 11, y: 11 })).toBe(false);
    expect(isFarEnough({ x: 10, y: 10 }, { x: 12, y: 10 })).toBe(true);
    expect(isFarEnough({ x: 10, y: 10 }, { x: 11, y: 12 })).toBe(true);
  });
});
