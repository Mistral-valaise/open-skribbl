import { t } from '../i18n/index.js';
import { cx } from './cx.js';

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The ring turns to the warning colour and pulses for the last ten seconds (DESIGN §8). */
const URGENT_SECONDS = 10;

interface TimerRingProps {
  /** Whole seconds left. */
  seconds: number;
  /** Share of the phase that is left, 0…1. */
  fraction: number;
  /** Only the drawing phase gets the last-seconds warning. */
  warn?: boolean;
  /** A smaller ring for the one-row bar shown while the on-screen keyboard is open. */
  compact?: boolean;
  className?: string;
}

/** Circular countdown with digits. */
export function TimerRing({
  seconds,
  fraction,
  warn = false,
  compact = false,
  className,
}: TimerRingProps) {
  const urgent = warn && seconds <= URGENT_SECONDS;
  const share = Math.min(1, Math.max(0, fraction));
  return (
    <div
      data-testid="timer"
      data-seconds={seconds}
      role="timer"
      aria-label={t('game.timeLeft', { seconds })}
      className={cx(
        'relative grid shrink-0 place-items-center',
        compact ? 'size-8' : 'size-12',
        urgent && 'animate-pulse-soft',
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90">
        <circle cx="24" cy="24" r={RADIUS} fill="none" strokeWidth="4" className="stroke-line" />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
          className={cx(
            'transition-[stroke-dashoffset] duration-300 ease-linear',
            urgent ? 'stroke-warning' : 'stroke-accent',
          )}
        />
      </svg>
      <span
        aria-hidden
        className={cx(
          'font-mono font-semibold tabular-nums',
          compact ? 'text-caption' : 'text-label',
          urgent ? 'text-warning' : 'text-fg',
        )}
      >
        {seconds}
      </span>
    </div>
  );
}
