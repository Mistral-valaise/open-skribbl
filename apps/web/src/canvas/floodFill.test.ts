import { FILL_TOLERANCE } from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { floodFill } from './floodFill.js';
import type { Rgb } from './palette.js';

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [20, 21, 28];
const RED: Rgb = [229, 56, 59];

function buffer(width: number, height: number, rgb: Rgb = WHITE): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) data.set([...rgb, 255], pixel * 4);
  return data;
}

function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, rgb: Rgb): void {
  data.set([...rgb, 255], (y * width + x) * 4);
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  return Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 3));
}

/** A square outline, `thickness` pixels wide, between `from` and `to` (inclusive). */
function drawBox(
  data: Uint8ClampedArray,
  width: number,
  from: number,
  to: number,
  thickness: number,
  rgb: Rgb = BLACK,
): void {
  for (let y = from; y <= to; y += 1) {
    for (let x = from; x <= to; x += 1) {
      const depth = Math.min(x - from, to - x, y - from, to - y);
      if (depth < thickness) setPixel(data, width, x, y, rgb);
    }
  }
}

describe('floodFill', () => {
  it('AC-003-11: a fill on a blank canvas colours every pixel', () => {
    const width = 40;
    const height = 30;
    const data = buffer(width, height);

    expect(floodFill(data, width, height, 17, 9, RED, FILL_TOLERANCE)).toBe(true);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        expect(pixelAt(data, width, x, y)).toEqual([...RED]);
      }
    }
  });

  it('AC-003-11: a fill inside a closed outline leaves the pixels outside unchanged', () => {
    const size = 30;
    const data = buffer(size, size);
    drawBox(data, size, 8, 21, 3); // outline over 8…10 and 19…21, inside 11…18
    const before = data.slice();

    expect(floodFill(data, size, size, 14, 14, RED, FILL_TOLERANCE)).toBe(true);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const inside = x >= 11 && x <= 18 && y >= 11 && y <= 18;
        const outside = x < 8 || x > 21 || y < 8 || y > 21;
        if (inside) expect(pixelAt(data, size, x, y)).toEqual([...RED]);
        if (outside) expect(pixelAt(data, size, x, y)).toEqual(pixelAt(before, size, x, y));
      }
    }
    // The outline itself survives apart from the one-pixel growth on its inner edge.
    expect(pixelAt(data, size, 8, 14)).toEqual([...BLACK]);
    expect(pixelAt(data, size, 9, 14)).toEqual([...BLACK]);
    expect(pixelAt(data, size, 10, 14)).toEqual([...RED]);
  });

  it('AC-003-11: a fill outside a closed outline leaves its inside unchanged', () => {
    const size = 30;
    const data = buffer(size, size);
    drawBox(data, size, 8, 21, 3);

    expect(floodFill(data, size, size, 0, 0, RED, FILL_TOLERANCE)).toBe(true);

    expect(pixelAt(data, size, 0, 29)).toEqual([...RED]);
    expect(pixelAt(data, size, 29, 29)).toEqual([...RED]);
    expect(pixelAt(data, size, 14, 14)).toEqual([...WHITE]);
  });

  it('AC-003-11: the region covers colours within the tolerance and stops beyond it', () => {
    const width = 6;
    const data = buffer(width, 1);
    setPixel(data, width, 1, 0, [255 - FILL_TOLERANCE, 255, 255]); // just within
    setPixel(data, width, 2, 0, [255 - FILL_TOLERANCE - 1, 255, 255]); // just beyond
    setPixel(data, width, 3, 0, BLACK);

    expect(floodFill(data, width, 1, 0, 0, RED, FILL_TOLERANCE, 0)).toBe(true);

    expect(pixelAt(data, width, 0, 0)).toEqual([...RED]);
    expect(pixelAt(data, width, 1, 0)).toEqual([...RED]);
    expect(pixelAt(data, width, 2, 0)).toEqual([255 - FILL_TOLERANCE - 1, 255, 255]);
    expect(pixelAt(data, width, 4, 0)).toEqual([...WHITE]);
  });

  it('AC-003-11: the region is 4-connected and does not leak through a diagonal gap', () => {
    const size = 4;
    const data = buffer(size, size);
    // A diagonal wall from the top right to the bottom left.
    for (let i = 0; i < size; i += 1) setPixel(data, size, size - 1 - i, i, BLACK);

    floodFill(data, size, size, 0, 0, RED, FILL_TOLERANCE, 0);

    expect(pixelAt(data, size, 0, 0)).toEqual([...RED]);
    expect(pixelAt(data, size, 3, 3)).toEqual([...WHITE]);
  });

  it('AC-003-11: the region grows by the requested number of pixels', () => {
    const width = 9;
    const data = buffer(width, 1, BLACK);
    setPixel(data, width, 4, 0, WHITE);

    floodFill(data, width, 1, 4, 0, RED, FILL_TOLERANCE, 2);

    const row = Array.from({ length: width }, (_, x) => pixelAt(data, width, x, 0)[0]);
    expect(row).toEqual([20, 20, 229, 229, 229, 229, 229, 20, 20]);
  });

  it('AC-003-12: a fill whose target pixel already has the fill colour changes nothing', () => {
    const size = 12;
    const data = buffer(size, size, RED);
    drawBox(data, size, 2, 9, 2);
    const before = data.slice();

    expect(floodFill(data, size, size, 5, 5, RED, FILL_TOLERANCE)).toBe(false);
    expect(data).toEqual(before);
  });

  it('AC-003-12: filling the same spot a second time is a no-op', () => {
    const size = 12;
    const data = buffer(size, size);

    expect(floodFill(data, size, size, 3, 3, RED, FILL_TOLERANCE)).toBe(true);
    const afterFirst = data.slice();
    expect(floodFill(data, size, size, 3, 3, RED, FILL_TOLERANCE)).toBe(false);
    expect(data).toEqual(afterFirst);
  });

  it('ignores a target outside the buffer', () => {
    const data = buffer(4, 4);
    expect(floodFill(data, 4, 4, 4, 0, RED, FILL_TOLERANCE)).toBe(false);
    expect(floodFill(data, 4, 4, 0, -1, RED, FILL_TOLERANCE)).toBe(false);
  });
});
