import type { Rgb } from './palette.js';

/**
 * Flood fill over an RGBA pixel buffer (spec 003, "Fill").
 *
 * Fills the 4-connected region of pixels whose colour is within `tolerance`
 * per channel of the pixel at (x, y), then grows the region by `grow` pixels so
 * that the anti-aliased rim of surrounding strokes is covered.
 *
 * Returns false and changes nothing when the target pixel already has the fill
 * colour; the drawer's client then sends no op.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: Rgb,
  tolerance: number,
  grow = 1,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;

  const start = (y * width + x) * 4;
  const targetR = data[start]!;
  const targetG = data[start + 1]!;
  const targetB = data[start + 2]!;
  const [fillR, fillG, fillB] = rgb;
  if (targetR === fillR && targetG === fillG && targetB === fillB) return false;

  const matches = (pixel: number) => {
    const offset = pixel * 4;
    return (
      Math.abs(data[offset]! - targetR) <= tolerance &&
      Math.abs(data[offset + 1]! - targetG) <= tolerance &&
      Math.abs(data[offset + 2]! - targetB) <= tolerance
    );
  };

  // 0 = untouched, 1 = part of the region, 2… = added while growing.
  const mask = new Uint8Array(width * height);
  const open = (pixel: number) => mask[pixel] === 0 && matches(pixel);

  // Scanline fill: take a pixel, fill its whole horizontal run, queue the runs above and below.
  const stack: number[] = [y * width + x];
  while (stack.length > 0) {
    let pixel = stack.pop()!;
    if (!open(pixel)) continue;
    const row = Math.floor(pixel / width);
    const rowStart = row * width;
    const rowEnd = rowStart + width;
    while (pixel > rowStart && open(pixel - 1)) pixel -= 1;

    let aboveOpen = false;
    let belowOpen = false;
    for (; pixel < rowEnd && open(pixel); pixel += 1) {
      mask[pixel] = 1;
      if (row > 0) {
        const above = open(pixel - width);
        if (above && !aboveOpen) stack.push(pixel - width);
        aboveOpen = above;
      }
      if (row < height - 1) {
        const below = open(pixel + width);
        if (below && !belowOpen) stack.push(pixel + width);
        belowOpen = below;
      }
    }
  }

  // Grow: each pass adds the 4-connected neighbours of what the previous pass added.
  const size = width * height;
  for (let pass = 1; pass <= grow; pass += 1) {
    for (let pixel = 0; pixel < size; pixel += 1) {
      if (mask[pixel] !== pass) continue;
      const column = pixel % width;
      if (column > 0 && mask[pixel - 1] === 0) mask[pixel - 1] = pass + 1;
      if (column < width - 1 && mask[pixel + 1] === 0) mask[pixel + 1] = pass + 1;
      if (pixel >= width && mask[pixel - width] === 0) mask[pixel - width] = pass + 1;
      if (pixel < size - width && mask[pixel + width] === 0) mask[pixel + width] = pass + 1;
    }
  }

  for (let pixel = 0; pixel < size; pixel += 1) {
    if (mask[pixel] === 0) continue;
    const offset = pixel * 4;
    data[offset] = fillR;
    data[offset + 1] = fillG;
    data[offset + 2] = fillB;
    data[offset + 3] = 255;
  }
  return true;
}
