import type { ParticipantView, RoomView } from '@kritzel/shared';
import { Crown, Eye, Unplug, UserMinus } from 'lucide-react';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';
import { IconButton, ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';

const TAG = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption';

interface TileProps {
  participant: ParticipantView;
  isHost: boolean;
  isYou: boolean;
  canKick: boolean;
}

function ParticipantTile({ participant, isHost, isYou, canKick }: TileProps) {
  const { id, nickname, avatar, connected, role } = participant;
  return (
    <li
      data-testid="player-row"
      data-participant-id={id}
      data-connected={connected}
      className={cx(
        'relative flex animate-enter flex-col items-center gap-2 rounded-lg border bg-surface-overlay px-3 pt-5 pb-4',
        isYou ? 'border-accent' : 'border-line',
      )}
    >
      <div className={cx('relative', !connected && 'opacity-40')}>
        <Avatar avatar={avatar} name={nickname} size={64} />
        {isHost ? (
          <span
            title={t('lobby.host')}
            className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border border-line bg-surface-raised text-warning"
          >
            <Crown size={16} strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
      </div>
      <span className="max-w-full truncate text-label text-fg">{nickname}</span>
      <div className="flex min-h-5 flex-wrap justify-center gap-1">
        {isHost ? (
          <span className={cx(TAG, 'bg-warning/15 text-warning')}>{t('lobby.host')}</span>
        ) : null}
        {isYou ? (
          <span className={cx(TAG, 'bg-accent/15 text-accent-fg')}>{t('lobby.you')}</span>
        ) : null}
        {role === 'spectator' ? (
          <span className={cx(TAG, 'bg-surface-hover text-fg-secondary')}>
            <Eye size={12} strokeWidth={1.75} aria-hidden />
            {t('lobby.spectator')}
          </span>
        ) : null}
        {connected ? null : (
          <span className={cx(TAG, 'bg-surface-hover text-fg-secondary')}>
            <Unplug size={12} strokeWidth={1.75} aria-hidden />
            {t('lobby.disconnected')}
          </span>
        )}
      </div>
      {canKick ? (
        <IconButton
          data-testid="kick-button"
          label={t('lobby.kick', { name: nickname })}
          icon={<UserMinus {...ICON} />}
          tone="danger"
          className="absolute top-1 left-1"
          onClick={() => send({ type: 'player.kick', playerId: id })}
        />
      ) : null}
    </li>
  );
}

/** Everyone in the room as avatar tiles; free seats are dashed outlines (DESIGN §9, "Lobby"). */
export function PlayerGrid({ view }: { view: RoomView }) {
  const youAreHost = view.hostId === view.you.id;
  const players = view.participants.filter((entry) => entry.role === 'player');
  const spectators = view.participants.filter((entry) => entry.role === 'spectator');
  const freeSeats = Math.max(0, view.settings.maxPlayers - players.length);

  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-subheading text-fg">{t('lobby.players')}</h2>
        <span className="font-mono text-label text-fg-secondary">
          {t('lobby.playerCount', { count: players.length, max: view.settings.maxPlayers })}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {[...players, ...spectators].map((participant) => (
          <ParticipantTile
            key={participant.id}
            participant={participant}
            isHost={participant.id === view.hostId}
            isYou={participant.id === view.you.id}
            canKick={youAreHost && participant.id !== view.you.id}
          />
        ))}
        {Array.from({ length: freeSeats }, (_, index) => (
          <li
            key={`free-${index}`}
            aria-hidden
            // Phones show two free seats at most, so the settings stay within reach.
            className={cx(
              'min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-caption text-fg-muted',
              index < 2 ? 'flex' : 'hidden sm:flex',
            )}
          >
            <span className="size-10 rounded-full border border-dashed border-line" />
            {t('lobby.emptySeat')}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
