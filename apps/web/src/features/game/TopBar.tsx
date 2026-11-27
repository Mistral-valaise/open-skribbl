import { TIMING, type RoomView } from '@kritzel/shared';
import { LogOut } from 'lucide-react';
import { secondsLeft } from '../../connection/clock.js';
import { t } from '../../i18n/index.js';
import { IconButton, ICON } from '../../ui/IconButton.js';
import { LanguageSwitch } from '../../ui/LanguageSwitch.js';
import { TimerRing } from '../../ui/TimerRing.js';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery.js';
import { Wordmark } from '../../ui/Wordmark.js';
import { useRemaining } from './useRemaining.js';
import { WordArea } from './WordArea.js';

/** How long the current phase lasts in total, for the share shown by the ring. */
function phaseDuration(view: RoomView): number {
  switch (view.phase) {
    case 'choosing':
      return TIMING.choosingMs;
    case 'drawing':
      return view.settings.drawTime * 1000;
    case 'turnEnd':
      return TIMING.turnEndMs;
    default:
      return 0;
  }
}

function RoundIndicator({ view }: { view: RoomView }) {
  return (
    <div
      className="flex shrink-0 items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0"
      aria-label={t('game.roundLabel', { round: view.round, total: view.totalRounds })}
    >
      <span aria-hidden className="text-caption text-fg-muted uppercase">
        {t('game.round')}
      </span>
      <span
        aria-hidden
        data-testid="round-indicator"
        data-round={view.round}
        data-total-rounds={view.totalRounds}
        className="font-mono text-label font-semibold whitespace-nowrap text-fg tabular-nums sm:text-body sm:font-semibold"
      >
        {t('game.roundOf', { round: view.round, total: view.totalRounds })}
      </span>
    </div>
  );
}

interface TopBarProps {
  view: RoomView;
  onLeave: () => void;
}

/**
 * Round, word and time: the three things a player reads at a glance (DESIGN §1),
 * plus the language switch and Leave. Phones get two rows: controls above,
 * word and timer below.
 */
export function TopBar({ view, onLeave }: TopBarProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const remaining = useRemaining();
  const duration = phaseDuration(view);

  const timer = (
    <TimerRing
      seconds={secondsLeft(remaining)}
      fraction={duration > 0 ? remaining / duration : 0}
      warn={view.phase === 'drawing'}
    />
  );
  const controls = (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <LanguageSwitch />
      <IconButton
        label={t('room.leave')}
        icon={<LogOut {...ICON} />}
        tone="danger"
        onClick={onLeave}
        data-testid="leave"
      />
    </div>
  );

  if (isPhone) {
    return (
      <header className="flex shrink-0 flex-col border-b border-line bg-surface-raised px-3 pt-1 pb-2">
        <div className="flex items-center justify-between gap-3">
          <RoundIndicator view={view} />
          {controls}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 justify-center">
            <WordArea view={view} />
          </div>
          {timer}
        </div>
      </header>
    );
  }

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-line bg-surface-raised px-4 py-2">
      <Wordmark size="sm" />
      <div className="ml-2 xl:ml-4">
        <RoundIndicator view={view} />
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <WordArea view={view} />
      </div>
      {timer}
      {controls}
    </header>
  );
}
