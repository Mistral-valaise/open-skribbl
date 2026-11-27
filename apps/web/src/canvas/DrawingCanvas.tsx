import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../i18n/index.js';
import { useRoomStore } from '../store/roomStore.js';
import { drawOp } from '../store/session.js';
import { useToolStore } from '../store/toolStore.js';
import { toLogicalPoint } from './geometry.js';
import { BUFFER_HEIGHT, BUFFER_WIDTH, DrawingRenderer } from './renderer.js';
import {
  abandonStroke,
  beginStroke,
  endStroke,
  extendStroke,
  isStrokeActive,
} from './strokeCapture.js';

interface DrawingCanvasProps {
  /** True for the drawer during the drawing phase; everyone else only watches. */
  interactive: boolean;
}

/**
 * The canvas of the current turn. It follows the op log in the store and, for
 * the drawer, turns pointer input into ops (spec 003).
 */
export function DrawingCanvas({ interactive }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<DrawingRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new DrawingRenderer(canvas);
    rendererRef.current = renderer;
    renderer.render(useRoomStore.getState().opLog.items);
    return useRoomStore.subscribe((state, previous) => {
      if (state.opLog !== previous.opLog) renderer.render(state.opLog.items);
    });
  }, []);

  // The turn can end while the pointer is still down.
  useEffect(() => {
    if (!interactive) return;
    return abandonStroke;
  }, [interactive]);

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>) =>
    toLogicalPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !event.isPrimary || event.button !== 0) return;
    const point = pointOf(event);
    const { tool, color, size } = useToolStore.getState();

    if (tool === 'fill') {
      // A fill that would change nothing is not an op (spec 003, "Fill").
      if (rendererRef.current?.wouldFill(point.x, point.y, color)) {
        drawOp({ type: 'fill', x: point.x, y: point.y, color });
      }
      return;
    }
    if (beginStroke(point, tool, color, size)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || !isStrokeActive()) return;
    const box = event.currentTarget.getBoundingClientRect();
    // Browsers merge fast pointer moves into one event; the merged ones keep the stroke smooth.
    const native = event.nativeEvent;
    const moves =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const move of moves.length > 0 ? moves : [native]) {
      extendStroke(toLogicalPoint(move.clientX, move.clientY, box));
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.isPrimary) endStroke();
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas"
      role="img"
      aria-label={t('canvas.label')}
      width={BUFFER_WIDTH}
      height={BUFFER_HEIGHT}
      className={`block h-full w-full touch-none select-none bg-paper ${
        interactive ? 'cursor-crosshair' : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    />
  );
}
