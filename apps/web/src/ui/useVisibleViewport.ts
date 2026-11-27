import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** Phone layout ends here (DESIGN §9); the same boundary as `PHONE_QUERY`. */
const PHONE_MAX_WIDTH = 640;
/** Spec 011: a visible height this much below the tallest seen means the keyboard is open. */
export const KEYBOARD_DROP_PX = 120;
/** Spec 011: below this visible height a phone is typing even if no taller height was seen. */
export const TYPING_MAX_HEIGHT_PX = 352;

/**
 * Whether the on-screen keyboard is taking up the screen (spec 011). A page
 * cannot ask for that; what it can see is that the visible height at phone
 * width dropped well below what it was. A fixed height alone would not do:
 * small phones would always count as typing and large ones never.
 */
export function isTyping(viewport: { width: number; height: number; tallest: number }): boolean {
  if (viewport.width >= PHONE_MAX_WIDTH) return false;
  return (
    viewport.height < TYPING_MAX_HEIGHT_PX || viewport.tallest - viewport.height >= KEYBOARD_DROP_PX
  );
}

/** Remembers the tallest visible height per width; a rotation starts over. */
export class TallestTracker {
  private width = 0;
  private tallest = 0;

  update(width: number, height: number): number {
    if (Math.abs(width - this.width) > 1) {
      this.width = width;
      this.tallest = 0;
    }
    this.tallest = Math.max(this.tallest, height);
    return this.tallest;
  }
}

export interface VisibleViewport {
  /** The on-screen keyboard is open: show the typing layout. */
  typing: boolean;
  /** Custom properties for the screen's root; empty unless typing. */
  style: CSSProperties;
}

interface Measured {
  typing: boolean;
  height: number;
  top: number;
}

function measure(tracker: TallestTracker): Measured {
  const visual = window.visualViewport;
  const width = visual?.width ?? window.innerWidth;
  const height = visual?.height ?? window.innerHeight;
  const tallest = tracker.update(width, height);
  return { typing: isTyping({ width, height, tallest }), height, top: visual?.offsetTop ?? 0 };
}

/**
 * Follows the part of the page that is actually visible. On phones the
 * keyboard shrinks the visual viewport but, depending on the browser, not
 * the layout, so `100dvh` keeps the height of the screen without keyboard and
 * the browser scrolls the canvas out of view. While typing, the screen takes
 * its height and position from here instead (`--app-height`, `--app-top`).
 */
export function useVisibleViewport(): VisibleViewport {
  const tracker = useRef<TallestTracker | null>(null);
  tracker.current ??= new TallestTracker();
  const [measured, setMeasured] = useState<Measured>(() => measure(tracker.current!));

  useEffect(() => {
    const update = () => {
      const next = measure(tracker.current!);
      setMeasured((previous) =>
        previous.typing === next.typing &&
        // Outside the typing layout nothing depends on the exact numbers.
        (!next.typing || (previous.height === next.height && previous.top === next.top))
          ? previous
          : next,
      );
    };
    update();
    const visual = window.visualViewport;
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!measured.typing) return { typing: false, style: {} };
  return {
    typing: true,
    style: {
      '--app-height': `${measured.height}px`,
      '--app-top': `${measured.top}px`,
    } as CSSProperties,
  };
}
