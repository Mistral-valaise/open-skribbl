import type { ReactNode } from 'react';

interface CompactPlayBarProps {
  /** Where the game stands, as short text: "2 / 3". */
  progress: ReactNode;
  /** The word area without its caption. */
  word: ReactNode;
  timer: ReactNode;
}

/**
 * The top bar while the on-screen keyboard is open (spec 011): one row with
 * what a guesser reads at a glance. A long mask wraps and the bar grows with
 * it; the canvas below takes what is left. Language, theme, sound and Leave
 * return with the full bar when the keyboard closes.
 */
export function CompactPlayBar({ progress, word, timer }: CompactPlayBarProps) {
  return (
    <header className="flex min-h-10 shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3 py-1">
      {progress}
      <div className="flex min-w-0 flex-1 justify-center">{word}</div>
      {timer}
    </header>
  );
}

interface CompactProgressProps {
  value: string;
  /** Spoken name, e.g. "Round 2 of 3". */
  label: string;
  testId: string;
  data?: Record<`data-${string}`, string | number>;
}

/** Progress as one short value; the caption of the full bar is in its spoken label. */
export function CompactProgress({ value, label, testId, data }: CompactProgressProps) {
  return (
    <div role="group" aria-label={label} className="shrink-0">
      <span
        aria-hidden
        data-testid={testId}
        {...data}
        className="font-mono text-label font-semibold whitespace-nowrap text-fg tabular-nums"
      >
        {value}
      </span>
    </div>
  );
}
