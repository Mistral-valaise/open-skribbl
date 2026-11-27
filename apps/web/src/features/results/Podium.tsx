import type { RankingEntry } from '@kritzel/shared';
import { t } from '../../i18n/index.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery.js';
import { useCountUp } from './useCountUp.js';

/** Step height and place in the row by position: the winner stands in the middle, highest. */
const STEPS = [
  { step: 'h-24 sm:h-32', order: 'order-2', delay: '300ms' },
  { step: 'h-16 sm:h-24', order: 'order-1', delay: '150ms' },
  { step: 'h-12 sm:h-16', order: 'order-3', delay: '0ms' },
] as const;

function Place({
  entry,
  position,
  youId,
}: {
  entry: RankingEntry;
  position: number;
  youId: string;
}) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const score = useCountUp(entry.score);
  const { step, order, delay } = STEPS[position]!;
  return (
    <li
      data-testid="podium-place"
      data-rank={entry.rank}
      data-participant-id={entry.id}
      data-score={entry.score}
      className={cx('flex min-w-0 flex-1 animate-enter flex-col items-center', order)}
      style={{ animationDelay: delay }}
    >
      <Avatar
        avatar={entry.avatar}
        name={entry.nickname}
        size={isPhone ? 64 : 120}
        className={cx('shadow-md', entry.left && 'opacity-40')}
      />
      <span className="mt-2 flex max-w-full items-center gap-1.5">
        <span className="truncate text-label text-fg sm:text-body sm:font-medium">
          {entry.nickname}
        </span>
        {entry.id === youId ? (
          <span className="shrink-0 text-caption text-accent-fg">{t('scoreboard.you')}</span>
        ) : null}
      </span>
      {entry.left ? <span className="text-caption text-fg-muted">{t('results.left')}</span> : null}
      <span
        aria-label={t('scoreboard.points', { score: entry.score })}
        className="font-mono text-label text-fg-secondary tabular-nums"
      >
        {score}
      </span>
      <div
        aria-label={t('results.place', { rank: entry.rank })}
        className={cx(
          'mt-2 grid w-full place-items-center rounded-t-lg border border-b-0 border-line bg-surface-raised',
          step,
        )}
      >
        <span
          aria-hidden
          className={cx(
            'font-display text-title sm:text-display',
            entry.rank === 1 ? 'text-warning' : 'text-fg-muted',
          )}
        >
          {entry.rank}
        </span>
      </div>
    </li>
  );
}

interface PodiumProps {
  ranking: readonly RankingEntry[];
  youId: string;
}

/**
 * The top three of the final ranking (spec 008, AC-008-10). The list is in
 * rank order; only its appearance puts the winner in the middle.
 */
export function Podium({ ranking, youId }: PodiumProps) {
  const top = ranking.slice(0, STEPS.length);
  if (top.length === 0) return null;
  return (
    <ol
      data-testid="podium"
      aria-label={t('results.podium')}
      className="mx-auto flex w-full max-w-xl items-end justify-center gap-2 border-b border-line sm:gap-4"
    >
      {top.map((entry, position) => (
        <Place key={entry.id} entry={entry} position={position} youId={youId} />
      ))}
    </ol>
  );
}
