import type { RoomView } from '@kritzel/shared';
import { RotateCcw, Trophy } from 'lucide-react';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';
import { Avatar } from '../../ui/Avatar.js';
import { Button } from '../../ui/Button.js';
import { cx } from '../../ui/cx.js';
import { ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';
import { RoomHeader } from '../../ui/RoomHeader.js';
import { Spinner } from '../../ui/Spinner.js';

interface ResultsScreenProps {
  view: RoomView;
  onLeave: () => void;
}

/** The final ranking of a game (spec 005). Podium and gallery arrive with spec 008. */
export function ResultsScreen({ view, onLeave }: ResultsScreenProps) {
  const ranking = view.results?.ranking ?? [];
  const isHost = view.hostId === view.you.id;
  const winners = ranking.filter((entry) => entry.rank === 1 && entry.score > 0);

  return (
    <div
      data-testid="results"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 sm:p-6"
    >
      <RoomHeader onLeave={onLeave} />
      <main className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <span className="grid size-14 animate-pop place-items-center rounded-full bg-warning/15 text-warning">
            <Trophy size={28} strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="font-display text-title text-fg">{t('results.title')}</h1>
          <p className="text-body text-fg-secondary">
            {winners.length === 1
              ? t('results.winner', { name: winners[0]!.nickname })
              : t('results.subtitle')}
          </p>
        </div>

        <Panel className="p-2 sm:p-3">
          {ranking.length === 0 ? (
            <p className="p-4 text-center text-label text-fg-secondary">{t('results.empty')}</p>
          ) : (
            <ol className="flex flex-col gap-1">
              {ranking.map((entry) => (
                <li
                  key={entry.id}
                  data-testid="ranking-row"
                  data-participant-id={entry.id}
                  data-rank={entry.rank}
                  data-score={entry.score}
                  className={cx(
                    'flex animate-enter items-center gap-3 rounded-md px-3 py-2',
                    entry.id === view.you.id && 'bg-accent/10',
                  )}
                >
                  <span
                    className={cx(
                      'w-8 shrink-0 text-center font-display text-heading tabular-nums',
                      entry.rank === 1 ? 'text-warning' : 'text-fg-muted',
                    )}
                  >
                    {entry.rank}
                  </span>
                  <Avatar
                    avatar={entry.avatar}
                    name={entry.nickname}
                    size={40}
                    className={entry.left ? 'opacity-40' : undefined}
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-body font-medium text-fg">{entry.nickname}</span>
                    {entry.id === view.you.id ? (
                      <span className="shrink-0 text-caption text-accent-fg">
                        {t('scoreboard.you')}
                      </span>
                    ) : null}
                    {entry.left ? (
                      <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-caption text-fg-secondary">
                        {t('results.left')}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-subheading text-fg tabular-nums">
                    {entry.score}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="flex flex-col items-center gap-3">
          {isHost ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto sm:min-w-56"
              icon={<RotateCcw {...ICON} />}
              onClick={() => send({ type: 'game.playAgain' })}
              data-testid="play-again"
            >
              {t('results.playAgain')}
            </Button>
          ) : (
            <p className="flex items-center gap-3 text-label text-fg-secondary">
              <Spinner className="text-fg-muted" />
              {t('results.waitingForHost')}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
