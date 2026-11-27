import { CANVAS_BACKGROUND, EXPORT_HEIGHT, EXPORT_WIDTH, type DrawItem } from '@kritzel/shared';
import { DrawingRenderer } from './renderer.js';

/**
 * Renders the items of a finished drawing off-screen with the same renderer as
 * the live canvas, so thumbnails and exports show exactly what was drawn
 * (docs/ARCHITECTURE.md §5, "Reuse").
 */
function renderOffscreen(items: readonly DrawItem[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  new DrawingRenderer(canvas).render(items);
  return canvas;
}

function copyScaled(source: HTMLCanvasElement, target: HTMLCanvasElement): void {
  const context = target.getContext('2d');
  if (!context) return;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = CANVAS_BACKGROUND;
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0, target.width, target.height);
}

/** Draws a scaled-down copy of the drawing onto `target`, whatever its size. */
export function drawThumbnail(target: HTMLCanvasElement, items: readonly DrawItem[]): void {
  copyScaled(renderOffscreen(items), target);
}

/** The drawing as a PNG of the export size on a white background (spec 008, "PNG export"). */
export function exportPng(items: readonly DrawItem[]): Promise<Blob> {
  const target = document.createElement('canvas');
  target.width = EXPORT_WIDTH;
  target.height = EXPORT_HEIGHT;
  copyScaled(renderOffscreen(items), target);
  return new Promise((resolve, reject) => {
    target.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
      'image/png',
    );
  });
}

/** Hands a file to the browser's download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started by the next task; the URL is no longer needed then.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
