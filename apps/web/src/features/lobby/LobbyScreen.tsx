import { MIN_PLAYERS_TO_START, type RoomView } from '@kritzel/shared';
import { Play } from 'lucide-react';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { send } from '../../store/session.js';
import { Button } from '../../ui/Button.js';
import { ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';
import { RoomHeader } from '../../ui/RoomHeader.js';
import { Spinner } from '../../ui/Spinner.js';
import { InviteCard } from './InviteCard.js';
import { PlayerGrid } from './PlayerGrid.js';
import { SettingsPanel } from './SettingsPanel.js';

interface LobbyScreenProps {
  view: RoomView;
  onLeave: () => void;
}

export function LobbyScreen({ view, onLeave }: LobbyScreenProps) {
  const isHost = view.hostId === view.you.id;
  const connectedPlayers = view.participants.filter(
    (entry) => entry.role === 'player' && entry.connected,
  ).length;
  const canStart = connectedPlayers >= MIN_PLAYERS_TO_START;
  // Controls that need the server rest while the client is reconnecting (spec 011).
  const connected = useRoomStore((state) => state.status === 'joined');

  return (
    <div
      data-testid="lobby"
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 p-4 sm:p-6"
    >
      <RoomHeader onLeave={onLeave} />
      <main className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <h1 className="sr-only">{t('lobby.title')}</h1>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <InviteCard code={view.code} />
          <PlayerGrid view={view} />
        </div>
        <div className="flex flex-col gap-4 sm:gap-6">
          <SettingsPanel view={view} editable={isHost} />
          <Panel className="flex flex-col gap-3 p-4 sm:p-6">
            {isHost ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={!canStart || !connected}
                  aria-describedby={canStart ? undefined : 'start-reason'}
                  icon={<Play {...ICON} />}
                  onClick={() => send({ type: 'game.start' })}
                  data-testid="start-game"
                >
                  {t('lobby.startGame')}
                </Button>
                {canStart ? null : (
                  <p id="start-reason" className="text-center text-caption text-fg-secondary">
                    {t('lobby.needPlayers', { min: MIN_PLAYERS_TO_START })}
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center justify-center gap-3 py-2 text-label text-fg-secondary">
                <Spinner className="text-fg-muted" />
                {t('lobby.waitingForHost')}
              </p>
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}
