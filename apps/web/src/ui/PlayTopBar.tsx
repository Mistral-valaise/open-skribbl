import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton, ICON } from './IconButton.js';
import { LanguageSwitch } from './LanguageSwitch.js';
import { MeasurementsControl } from './MeasurementsControl.js';
import { MuteToggle, ShellControls, ThemeToggle } from './ShellControls.js';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery.js';
import { Wordmark } from './Wordmark.js';

interface PlayTopBarProps {
  /** Where the game stands: the round, or the drawing of a solo run. */
  progress: ReactNode;
  /** The word area: mask, word, or who is choosing. */
  word: ReactNode;
  timer: ReactNode;
  leaveLabel: string;
  onLeave: () => void;
}

/**
 * The top bar of the game and of solo mode (DESIGN §9): progress, word and
 * time, the three things a player reads at a glance, plus language, theme,
 * sound and Leave. Phones get two rows: controls above; progress, word and
 * timer below.
 */
export function PlayTopBar({ progress, word, timer, leaveLabel, onLeave }: PlayTopBarProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const leave = (
    <IconButton
      label={leaveLabel}
      icon={<LogOut {...ICON} />}
      tone="danger"
      onClick={onLeave}
      data-testid="leave"
    />
  );

  if (isPhone) {
    return (
      <header className="flex shrink-0 flex-col border-b border-line bg-surface-raised px-3 pt-1 pb-2">
        {/* With the control for browser measurements, the narrowest phones need a second row. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <LanguageSwitch />
          <div className="ml-auto flex shrink-0 items-center">
            <ThemeToggle />
            <MuteToggle />
            <MeasurementsControl />
            {leave}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {progress}
          <div className="flex min-w-0 flex-1 justify-center">{word}</div>
          {timer}
        </div>
      </header>
    );
  }

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-line bg-surface-raised px-4 py-2">
      <Wordmark size="sm" />
      <div className="ml-2 xl:ml-4">{progress}</div>
      <div className="flex min-w-0 flex-1 justify-center">{word}</div>
      {timer}
      <ShellControls />
      {leave}
    </header>
  );
}

interface ProgressIndicatorProps {
  /** The caption above the value, e.g. "Round". */
  caption: string;
  /** What is shown, e.g. "2 / 3". */
  value: string;
  /** The full sentence for assistive technology, e.g. "Round 2 of 3". */
  label: string;
  testId: string;
  /** Machine-readable values as `data-*` attributes. */
  data: Readonly<Record<`data-${string}`, number>>;
}

export function ProgressIndicator({ caption, value, label, testId, data }: ProgressIndicatorProps) {
  return (
    <div role="group" className="flex shrink-0 flex-col" aria-label={label}>
      <span aria-hidden className="text-caption text-fg-muted uppercase">
        {caption}
      </span>
      <span
        aria-hidden
        data-testid={testId}
        {...data}
        className="font-mono text-label font-semibold whitespace-nowrap text-fg tabular-nums sm:text-body sm:font-semibold"
      >
        {value}
      </span>
    </div>
  );
}
