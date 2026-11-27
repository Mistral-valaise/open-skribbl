import { CANVAS_HEIGHT, CANVAS_WIDTH, type DrawItem } from '@kritzel/shared';
import { useEffect, useRef } from 'react';
import { cx } from '../ui/cx.js';
import { drawThumbnail } from './renderDrawing.js';

interface DrawingThumbnailProps {
  items: readonly DrawItem[];
  /** Describes the drawing for assistive technology. */
  label: string;
  testId?: string;
  /** Sets the width; the height follows from the 4:3 ratio. */
  className?: string;
}

/** A scaled-down, read-only copy of a drawing: turn end and gallery (DESIGN §9). */
export function DrawingThumbnail({ items, label, testId, className }: DrawingThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawThumbnail(canvasRef.current, items);
  }, [items]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={testId}
      role="img"
      aria-label={label}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className={cx('block aspect-[4/3] bg-paper', className)}
    />
  );
}
