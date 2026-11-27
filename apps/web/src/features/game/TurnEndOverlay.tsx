import type { RoomView } from '@kritzel/shared';
import { t } from '../../i18n/index.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';

/** After a turn: the word, why the turn ended and what each player earned (spec 005). */
export function TurnEndOverlay({ view }: { view: RoomView }) {
  const turnEnd = view.turnEnd;
  if (!turnEnd) return null;

  const earned = view.participants
    .filter((entry) => entry.id in turnEnd.deltas)
    .map((entry) => ({ player: entry, points: turnEnd.deltas[entry.id] ?? 0 }))
    .sort((a, b) => b.points - a.points);

  return (
    <div className="absolute inset-0 grid animate-fade-in place-items-center overflow-y-auto bg-scrim p-3 backdrop-blur-sm">
      <div
        data-testid="turn-end"
        data-reason={turnEnd.reason}
        role="status"
        className="flex max-h-full w-full max-w-md animate-overlay flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface-raised p-4 text-center shadow-lg sm:gap-4 sm:p-6"
      >
        <div className="flex flex-col items-center gap-1">
          <span className="rounded-full bg-surface-hover px-3 py-0.5 text-caption text-fg-secondary">
            {t(`turnEnd.reason.${turnEnd.reason}`)}
          </span>
          {view.word === null ? (
            <p className="pt-1 text-subheading text-fg">{t('turnEnd.noWord')}</p>
          ) : (
            <>
              <span className="pt-1 text-caption text-fg-muted uppercase">
                {t('game.theWordWas')}
              </span>
              <span
                data-testid="turn-end-word"
                className="font-display text-heading break-words text-fg sm:text-title"
              >
                {view.word}
              </span>
            </>
          )}
        </div>
        {earned.length > 0 ? (
          <ul aria-label={t('turnEnd.points')} className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {earned.map(({ player, points }) => (
              <li
                key={player.id}
                data-testid="turn-end-delta"
                data-participant-id={player.id}
                data-delta={points}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left"
              >
                <Avatar avatar={player.avatar} name={player.nickname} size={28} />
                <span className="min-w-0 flex-1 truncate text-label text-fg">
                  {player.nickname}
                </span>
                <span
                  className={cx(
                    'font-mono text-label font-semibold tabular-nums',
                    points > 0 ? 'animate-pop text-success' : 'text-fg-muted',
                  )}
                >
                  {t('turnEnd.delta', { points })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
