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
 * The game screen at its three breakpoints (DESIGN §9):
 * phone: top bar, canvas, toolbar, scoreboard strip, chat filling the rest;
 * tablet: canvas across, scoreboard and chat side by side below;
 * desktop: scoreboard, canvas and chat in three columns, without page scroll.
 */
export function GameScreen({ view, onLeave }: GameScreenProps) {
  return (
    <div
      data-testid="game"
      data-phase={view.phase}
      className="flex h-dvh flex-col overflow-y-auto sm:h-auto sm:min-h-dvh sm:overflow-visible lg:h-dvh lg:overflow-hidden"
    >
      <TopBar view={view} onLeave={onLeave} />
      <main className="flex min-h-0 flex-1 flex-col gap-2 pb-2 sm:grid sm:grid-cols-2 sm:content-start sm:gap-4 sm:p-4 lg:grid-cols-[15rem_minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)]">
        <Stage view={view} className="sm:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1" />
        <Scoreboard view={view} className="sm:h-96 lg:col-start-1 lg:row-start-1 lg:h-auto" />
        <Chat
          view={view}
          className="mx-2 min-h-44 flex-1 sm:mx-0 sm:h-96 sm:flex-none lg:col-start-3 lg:row-start-1 lg:h-auto"
        />
      </main>
    </div>
  );
}
