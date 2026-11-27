import { TIMING, type RoomView } from '@kritzel/shared';
import { LogOut } from 'lucide-react';
import { secondsLeft } from '../../connection/clock.js';
import { t } from '../../i18n/index.js';
import { IconButton, ICON } from '../../ui/IconButton.js';
import { TimerRing } from '../../ui/TimerRing.js';
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

interface TopBarProps {
  view: RoomView;
  onLeave: () => void;
}

/** Round, word and time: the three things a player reads at a glance (DESIGN §1). */
export function TopBar({ view, onLeave }: TopBarProps) {
  const remaining = useRemaining();
  const duration = phaseDuration(view);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3 py-2 sm:gap-4 sm:px-4">
      <Wordmark size="sm" className="hidden lg:inline-block" />
      <div
        className="flex shrink-0 flex-col lg:ml-4"
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
      <div className="flex min-w-0 flex-1 justify-center">
        <WordArea view={view} />
      </div>
      <TimerRing
        seconds={secondsLeft(remaining)}
        fraction={duration > 0 ? remaining / duration : 0}
        warn={view.phase === 'drawing'}
      />
      <IconButton
        label={t('room.leave')}
        icon={<LogOut {...ICON} />}
        tone="danger"
        onClick={onLeave}
        data-testid="leave"
      />
    </header>
  );
}
