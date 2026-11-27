import { useEffect, useState } from 'react';
import { PALETTE_ROWS } from '../../canvas/palette.js';

/** Confetti falls once, for at most three seconds (DESIGN §6). */
const CONFETTI_MS = 3000;
const PIECES = 70;
/** The mid row of the drawing palette, without its greys. */
const COLORS = PALETTE_ROWS[1].slice(2);

/** A repeatable stand-in for randomness: the same piece always looks the same. */
const spread = (index: number, salt: number) => ((index * 9301 + salt * 49297) % 233280) / 233280;

/**
 * Celebrates the results. With reduced motion it does not appear at all:
 * the podium already says who won (spec 011, AC-011-12).
 */
export function Confetti() {
  const [falling, setFalling] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!falling) return;
    const timer = window.setTimeout(() => setFalling(false), CONFETTI_MS);
    return () => window.clearTimeout(timer);
  }, [falling]);

  if (!falling) return null;
  return (
    <div
      data-testid="confetti"
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      {Array.from({ length: PIECES }, (_, index) => {
        const duration = 1700 + spread(index, 1) * 1100;
        return (
          <span
            key={index}
            className="absolute -top-4 block animate-confetti rounded-[2px]"
            style={{
              left: `${spread(index, 2) * 100}%`,
              width: 6 + spread(index, 3) * 6,
              height: 10 + spread(index, 4) * 8,
              backgroundColor: COLORS[index % COLORS.length],
              animationDuration: `${duration}ms`,
              // Every piece has landed before the layer is removed.
              animationDelay: `${spread(index, 5) * (CONFETTI_MS - duration - 100)}ms`,
              rotate: `${spread(index, 6) * 360}deg`,
            }}
          />
        );
      })}
    </div>
  );
}
