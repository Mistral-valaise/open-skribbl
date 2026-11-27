import type { RoomView } from '@kritzel/shared';
import { Chat } from './Chat.js';
import { Scoreboard } from './Scoreboard.js';
import { Stage } from './Stage.js';
import { TopBar } from './TopBar.js';

interface GameScreenProps {
  view: RoomView;
  onLeave: () => void;
}

/**
 * The game screen at its three breakpoints (DESIGN §9). The screen never
 * needs page scrolling to play: canvas and chat are visible together.
 * - Phone: top bar, canvas, toolbar, scoreboard strip, chat filling the rest.
 * - From 640 px: canvas across, scoreboard and chat side by side below.
 * - From 1280 px: scoreboard, canvas and chat in three columns.
 */
export function GameScreen({ view, onLeave }: GameScreenProps) {
  const me = view.participants.find((entry) => entry.id === view.you.id);
  // What this participant is in the current turn, for styling hooks and tests.
  const presence =
    view.you.role === 'spectator'
      ? 'spectator'
      : me?.waiting
        ? 'waiting'
        : view.drawerId === view.you.id
          ? 'drawer'
          : 'guesser';
  return (
    <div
      data-testid="game"
      data-phase={view.phase}
      data-presence={presence}
      className="flex h-dvh flex-col overflow-y-auto xl:overflow-hidden"
    >
      <TopBar view={view} onLeave={onLeave} />
      <main className="flex min-h-0 flex-1 flex-col gap-2 pb-2 sm:grid sm:grid-cols-2 sm:grid-rows-[auto_minmax(13rem,1fr)] sm:gap-4 sm:p-4 xl:grid-cols-[15rem_minmax(0,1fr)_20rem] xl:grid-rows-[minmax(0,1fr)]">
        <Stage view={view} className="sm:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-start-1" />
        <Scoreboard view={view} className="xl:col-start-1 xl:row-start-1" />
        <Chat
          view={view}
          className="mx-2 min-h-44 flex-1 sm:mx-0 sm:min-h-0 xl:col-start-3 xl:row-start-1"
        />
      </main>
    </div>
  );
}
