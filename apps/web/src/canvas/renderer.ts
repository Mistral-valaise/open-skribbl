import {
  CANVAS_BACKGROUND,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FILL_TOLERANCE,
  type DrawItem,
  type StrokeItem,
} from '@kritzel/shared';
import { floodFill } from './floodFill.js';
import { hexToRgb } from './palette.js';

/**
 * Backing-store pixels per logical pixel. The buffer has the same size on
 * every client, whatever the display size or device pixel ratio, so a flood
 * fill covers the same region for everyone.
 */
export const RENDER_SCALE = 2;
export const BUFFER_WIDTH = CANVAS_WIDTH * RENDER_SCALE;
export const BUFFER_HEIGHT = CANVAS_HEIGHT * RENDER_SCALE;

/** What is on the canvas for one item: the item and how much of its stroke is drawn. */
interface Painted {
  item: DrawItem;
  /** Length of the stroke's flat point list that has been drawn; 0 for other items. */
  drawn: number;
}

const drawnLength = (item: DrawItem) => (item.kind === 'stroke' ? item.points.length : 0);

/** Whether `item` is what `painted` shows, possibly with more stroke points added since. */
function continues(painted: Painted, item: DrawItem): boolean {
  if (painted.item === item) return true;
  return (
    painted.item.kind === 'stroke' &&
    item.kind === 'stroke' &&
    painted.item.id === item.id &&
    item.points.length >= painted.drawn
  );
}

/**
 * Draws the effective items of an op log onto a canvas (spec 003). Growing
 * strokes and new items are appended to what is already there; anything else
 * (undo, redo of older state, a new turn, a rejoin) redraws from the items.
 *
 * A stroke is always drawn the same way, point by point, whether it arrives
 * live or in one piece, so every client ends up with the same pixels.
 */
export class DrawingRenderer {
  private readonly context: CanvasRenderingContext2D;
  private painted: Painted[] = [];

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = BUFFER_WIDTH;
    canvas.height = BUFFER_HEIGHT;
    // Fills read the pixels back, which is far faster on a software-backed canvas.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is not available');
    this.context = context;
    this.clear();
  }

  render(items: readonly DrawItem[]): void {
    const stillThere =
      this.painted.length <= items.length &&
      this.painted.every((painted, index) => continues(painted, items[index]!));
    if (!stillThere) {
      this.clear();
      this.painted = [];
    }

    items.forEach((item, index) => {
      const painted = this.painted[index];
      if (!painted) {
        this.paint(item, 0);
        this.painted.push({ item, drawn: drawnLength(item) });
      } else if (painted.item !== item) {
        this.paint(item, painted.drawn);
        this.painted[index] = { item, drawn: drawnLength(item) };
      }
    });
  }

  /** Whether a fill at this logical point would change the canvas (spec 003, "Fill"). */
  wouldFill(x: number, y: number, color: string): boolean {
    const [pixelX, pixelY] = this.toPixel(x, y);
    const [red, green, blue] = this.context.getImageData(pixelX, pixelY, 1, 1).data;
    const [fillRed, fillGreen, fillBlue] = hexToRgb(color);
    return red !== fillRed || green !== fillGreen || blue !== fillBlue;
  }

  private toPixel(x: number, y: number): [number, number] {
    return [
      Math.min(BUFFER_WIDTH - 1, Math.max(0, Math.round(x * RENDER_SCALE))),
      Math.min(BUFFER_HEIGHT - 1, Math.max(0, Math.round(y * RENDER_SCALE))),
    ];
  }

  private clear(): void {
    const { context } = this;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = CANVAS_BACKGROUND;
    context.fillRect(0, 0, BUFFER_WIDTH, BUFFER_HEIGHT);
  }

  private paint(item: DrawItem, alreadyDrawn: number): void {
    switch (item.kind) {
      case 'stroke':
        return this.paintStroke(item, alreadyDrawn);
      case 'fill':
        return this.paintFill(item.x, item.y, item.color);
      case 'clear':
        return this.clear();
    }
  }

  /** Draws the stroke's points from index `from` of its flat point list. */
  private paintStroke(stroke: StrokeItem, from: number): void {
    const { context } = this;
    const { points, size } = stroke;
    const color = stroke.tool === 'eraser' ? CANVAS_BACKGROUND : stroke.color;
    context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = size;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    let index = from;
    if (index === 0) {
      // The first point is a dot of the stroke's diameter (spec 003, "Ops").
      context.beginPath();
      context.arc(points[0]!, points[1]!, size / 2, 0, Math.PI * 2);
      context.fill();
      index = 2;
    }
    for (; index + 1 < points.length; index += 2) {
      context.beginPath();
      context.moveTo(points[index - 2]!, points[index - 1]!);
      context.lineTo(points[index]!, points[index + 1]!);
      context.stroke();
    }
  }

  private paintFill(x: number, y: number, color: string): void {
    const { context } = this;
    const [pixelX, pixelY] = this.toPixel(x, y);
    const image = context.getImageData(0, 0, BUFFER_WIDTH, BUFFER_HEIGHT);
    const changed = floodFill(
      image.data,
      BUFFER_WIDTH,
      BUFFER_HEIGHT,
      pixelX,
      pixelY,
      hexToRgb(color),
      FILL_TOLERANCE,
      RENDER_SCALE,
    );
    if (changed) context.putImageData(image, 0, 0);
  }
}
