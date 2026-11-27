import type { ParticipantView, RoomView } from '@kritzel/shared';
import { Check, ChevronDown, ChevronUp, Crown, Eye, Pencil, Unplug } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';
import { IconButton, ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery.js';

const BADGE = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

interface RowState {
  isDrawer: boolean;
  isHost: boolean;
  isYou: boolean;
}

function rowState(view: RoomView, player: ParticipantView): RowState {
  return {
    isDrawer: player.id === view.drawerId,
    isHost: player.id === view.hostId,
    isYou: player.id === view.you.id,
  };
}

/** State badges: an icon with a text alternative, never colour alone (DESIGN §3). */
function Badges({ player, isDrawer, isHost }: { player: ParticipantView } & RowState) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {isHost ? (
        <span title={t('scoreboard.host')} className="text-warning">
          <Crown {...BADGE} />
          <span className="sr-only">{t('scoreboard.host')}</span>
        </span>
      ) : null}
      {isDrawer ? (
        <span title={t('scoreboard.drawer')} className="text-accent-fg">
          <Pencil {...BADGE} />
          <span className="sr-only">{t('scoreboard.drawer')}</span>
        </span>
      ) : null}
      {player.hasGuessed ? (
        <span title={t('scoreboard.guessed')} className="animate-pop text-success">
          <Check {...BADGE} strokeWidth={3} />
          <span className="sr-only">{t('scoreboard.guessed')}</span>
        </span>
      ) : null}
      {player.connected ? null : (
        <span title={t('scoreboard.disconnected')} className="text-fg-muted">
          <Unplug {...BADGE} />
          <span className="sr-only">{t('scoreboard.disconnected')}</span>
        </span>
      )}
    </span>
  );
}

const rowAttributes = (player: ParticipantView, state: RowState) => ({
  'data-testid': 'score-row',
  'data-participant-id': player.id,
  'data-score': player.score,
  'data-rank': player.rank ?? undefined,
  'data-guessed': player.hasGuessed,
  'data-drawer': state.isDrawer,
  'data-connected': player.connected,
});

function ScoreRow({ view, player }: { view: RoomView; player: ParticipantView }) {
  const state = rowState(view, player);
  return (
    <li
      {...rowAttributes(player, state)}
      className={cx(
        'flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors motion-base',
        player.hasGuessed && 'bg-success/10',
        state.isDrawer && !player.hasGuessed && 'bg-accent/10',
      )}
    >
      <span
        role="img"
        aria-label={t('scoreboard.rank', { rank: player.rank ?? 0 })}
        className="w-5 shrink-0 text-center font-mono text-label text-fg-muted tabular-nums"
      >
        {player.rank}
      </span>
      <Avatar
        avatar={player.avatar}
        name={player.nickname}
        size={40}
        className={player.connected ? undefined : 'opacity-40'}
      />
      <div className={cx('flex min-w-0 flex-1 flex-col', !player.connected && 'opacity-60')}>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-label text-fg">{player.nickname}</span>
          {state.isYou ? (
            <span className="shrink-0 text-caption text-accent-fg">{t('scoreboard.you')}</span>
          ) : null}
        </span>
        <span
          role="img"
          aria-label={t('scoreboard.points', { score: player.score })}
          className="font-mono text-caption text-fg-secondary tabular-nums"
        >
          {player.score}
        </span>
      </div>
      <Badges player={player} {...state} />
    </li>
  );
}

/** One player in the phone layout's horizontal strip. */
function ScoreChip({ view, player }: { view: RoomView; player: ParticipantView }) {
  const state = rowState(view, player);
  return (
    <li
      {...rowAttributes(player, state)}
      className={cx(
        'flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1',
        player.hasGuessed
          ? 'border-success/50 bg-success/10'
          : state.isDrawer
            ? 'border-accent/60 bg-accent/10'
            : 'border-line bg-surface-raised',
        !player.connected && 'opacity-50',
      )}
    >
      <Avatar avatar={player.avatar} name={player.nickname} size={28} />
      <span className="flex flex-col">
        <span className="max-w-20 truncate text-caption text-fg">{player.nickname}</span>
        <span className="font-mono text-caption text-fg-secondary tabular-nums">
          {player.score}
        </span>
      </span>
      <Badges player={player} {...state} />
    </li>
  );
}

/** Players by rank; equal scores keep their join order (spec 005, "Ranking"). */
function byRank(participants: readonly ParticipantView[]): ParticipantView[] {
  return participants
    .filter((entry) => entry.role === 'player')
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/**
 * The live list of players and scores. On phones it is a horizontal strip
 * that expands to the full list on tap (DESIGN §9, "Game").
 */
export function Scoreboard({ view, className }: { view: RoomView; className?: string }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [expanded, setExpanded] = useState(false);
  const players = byRank(view.participants);
  const spectators = view.participants.filter((entry) => entry.role === 'spectator');

  if (isPhone && !expanded) {
    return (
      <nav
        aria-label={t('scoreboard.title')}
        className={cx('flex shrink-0 items-center gap-1 pl-3', className)}
      >
        <ul className="scroll-hidden flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
          {players.map((player) => (
            <ScoreChip key={player.id} view={view} player={player} />
          ))}
        </ul>
        <IconButton
          label={t('scoreboard.expand')}
          icon={<ChevronDown {...ICON} />}
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        />
      </nav>
    );
  }

  return (
    <Panel
      as="aside"
      aria-label={t('scoreboard.title')}
      className={cx('flex min-h-0 flex-col', isPhone && 'mx-3 max-h-56 shrink-0', className)}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 className="text-label text-fg-secondary">{t('scoreboard.title')}</h2>
        {isPhone ? (
          <IconButton
            label={t('scoreboard.collapse')}
            icon={<ChevronUp {...ICON} />}
            aria-expanded
            className="-my-2 -mr-2"
            onClick={() => setExpanded(false)}
          />
        ) : null}
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ul className="flex flex-col gap-0.5">
          {players.map((player) => (
            <ScoreRow key={player.id} view={view} player={player} />
          ))}
        </ul>
        {spectators.length > 0 ? (
          <div className="mt-2 border-t border-line px-2 pt-2">
            <h3 className="flex items-center gap-1.5 pb-1 text-caption text-fg-muted">
              <Eye size={14} strokeWidth={1.75} aria-hidden />
              {t('scoreboard.spectators')}
            </h3>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {spectators.map((spectator) => (
                <li
                  key={spectator.id}
                  className={cx(
                    'flex items-center gap-1.5 text-caption text-fg-secondary',
                    !spectator.connected && 'opacity-50',
                  )}
                >
                  <Avatar avatar={spectator.avatar} name={spectator.nickname} size={28} />
                  <span className="max-w-24 truncate">{spectator.nickname}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
