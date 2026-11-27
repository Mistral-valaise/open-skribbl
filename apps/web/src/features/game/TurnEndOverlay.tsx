import type { RoomView } from '@kritzel/shared';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { DrawingThumbnail } from '../../canvas/DrawingThumbnail.js';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';

const COUNT = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

/**
 * After a turn: the word, a scaled-down drawing, the likes it got and what
 * each player earned (DESIGN §9, spec 005, spec 008).
 */
export function TurnEndOverlay({ view }: { view: RoomView }) {
  const items = useRoomStore((state) => state.opLog.items);
  const turnEnd = view.turnEnd;
  if (!turnEnd) return null;

  const earned = view.participants
    .filter((entry) => entry.id in turnEnd.deltas)
    .map((entry) => ({ player: entry, points: turnEnd.deltas[entry.id] ?? 0 }))
    .sort((a, b) => b.points - a.points);
  const { up, down } = turnEnd.likes;

  return (
    <div className="absolute inset-0 grid animate-fade-in place-items-center overflow-y-auto bg-scrim p-2 backdrop-blur-sm sm:p-3">
      <div
        data-testid="turn-end"
        data-reason={turnEnd.reason}
        role="status"
        className="flex max-h-full w-full max-w-lg animate-overlay flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface-raised p-3 shadow-lg sm:gap-4 sm:p-5"
      >
        <div className="flex items-center gap-3 sm:gap-5">
          {view.word === null ? null : (
            <DrawingThumbnail
              items={items}
              label={t('turnEnd.drawing')}
              testId="turn-end-drawing"
              className="w-28 shrink-0 rounded-md ring-1 ring-line sm:w-44"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
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
                  className="max-w-full font-display text-heading break-words text-fg sm:text-title"
                >
                  {view.word}
                </span>
                <span
                  data-testid="turn-end-likes"
                  data-up={up}
                  data-down={down}
                  className="flex items-center gap-3 pt-1 font-mono text-label text-fg-secondary tabular-nums"
                >
                  <span
                    className="flex items-center gap-1"
                    title={t('like.upCount', { count: up })}
                  >
                    <ThumbsUp {...COUNT} />
                    <span aria-hidden>{up}</span>
                    <span className="sr-only">{t('like.upCount', { count: up })}</span>
                  </span>
                  <span
                    className="flex items-center gap-1"
                    title={t('like.downCount', { count: down })}
                  >
                    <ThumbsDown {...COUNT} />
                    <span aria-hidden>{down}</span>
                    <span className="sr-only">{t('like.downCount', { count: down })}</span>
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
        {earned.length > 0 ? (
          <ul
            aria-label={t('turnEnd.points')}
            className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-line pt-2 sm:gap-x-4 sm:pt-3"
          >
            {earned.map(({ player, points }) => (
              <li
                key={player.id}
                data-testid="turn-end-delta"
                data-participant-id={player.id}
                data-delta={points}
                className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left sm:px-2"
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
