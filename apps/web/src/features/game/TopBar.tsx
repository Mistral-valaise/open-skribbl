import { TIMING, type RoomView } from '@kritzel/shared';
import { secondsLeft } from '../../connection/clock.js';
import { t } from '../../i18n/index.js';
import { CompactPlayBar, CompactProgress } from '../../ui/CompactPlayBar.js';
import { PlayTopBar, ProgressIndicator } from '../../ui/PlayTopBar.js';
import { TimerRing } from '../../ui/TimerRing.js';
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
  /** The on-screen keyboard is open: one row, no shell controls (spec 011). */
  compact?: boolean;
}

/** The game's top bar: round, word area and the timer of the current phase. */
export function TopBar({ view, onLeave, compact = false }: TopBarProps) {
  const remaining = useRemaining();
  const duration = phaseDuration(view);
  const round = { round: view.round, total: view.totalRounds };
  const timer = (
    <TimerRing
      seconds={secondsLeft(remaining)}
      fraction={duration > 0 ? remaining / duration : 0}
      warn={view.phase === 'drawing'}
      compact={compact}
    />
  );

  if (compact) {
    return (
      <CompactPlayBar
        progress={
          <CompactProgress
            value={t('game.roundOf', round)}
            label={t('game.roundLabel', round)}
            testId="round-indicator"
            data={{ 'data-round': view.round, 'data-total-rounds': view.totalRounds }}
          />
        }
        word={<WordArea view={view} compact />}
        timer={timer}
      />
    );
  }

  return (
    <PlayTopBar
      progress={
        <ProgressIndicator
          caption={t('game.round')}
          value={t('game.roundOf', round)}
          label={t('game.roundLabel', round)}
          testId="round-indicator"
          data={{ 'data-round': view.round, 'data-total-rounds': view.totalRounds }}
        />
      }
      word={<WordArea view={view} />}
      timer={timer}
      leaveLabel={t('room.leave')}
      onLeave={onLeave}
    />
  );
}
