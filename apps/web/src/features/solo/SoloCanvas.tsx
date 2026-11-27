import { planReplay, replayAt } from '@kritzel/shared';
import { useEffect, useRef } from 'react';
import { DrawingRenderer, BUFFER_HEIGHT, BUFFER_WIDTH } from '../../canvas/renderer.js';
import { t } from '../../i18n/index.js';

interface SoloCanvasProps {
  /** The drawing, fitted to the canvas. */
  strokes: readonly (readonly number[])[];
  /** When the replay started, on the clock of `Date.now()`. */
  startedAt: number;
  /** Show the finished drawing at once, as during the reveal. */
  complete: boolean;
}

/**
 * The computer's canvas: replays a drawing stroke by stroke at constant pen
 * speed through the same renderer as the game (spec 009, "Timing").
 */
export function SoloCanvas({ strokes, startedAt, complete }: SoloCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new DrawingRenderer(canvas);
    const plan = planReplay(strokes);
    let frame = 0;
    const draw = () => {
      const elapsed = complete ? plan.durationMs : Date.now() - startedAt;
      renderer.render(replayAt(plan, elapsed));
      if (elapsed < plan.durationMs) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [strokes, startedAt, complete]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas"
      role="img"
      aria-label={t('canvas.label')}
      width={BUFFER_WIDTH}
      height={BUFFER_HEIGHT}
      className="block h-full w-full bg-paper select-none"
    />
  );
}
