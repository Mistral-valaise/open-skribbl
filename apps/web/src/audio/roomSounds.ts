import type { Phase, ServerMessage } from '@kritzel/shared';
import type { RoomData } from '../store/roomReducer.js';
import type { SoundEvent } from './soundPlayer.js';

/** The tick sounds for each of the last ten seconds of the drawing phase (spec 011). */
const TICK_SECONDS = 10;

/**
 * Which effects a server message triggers, given the room before and after it
 * (spec 011, "Sound"). Sound only repeats what is also visible.
 */
export function soundEventsFor(
  before: RoomData,
  after: RoomData,
  message: ServerMessage,
): SoundEvent[] {
  switch (message.type) {
    case 'guess.feedback':
      return message.kind === 'correct' ? ['correctSelf'] : [];
    case 'chat.message': {
      if (message.kind !== 'system') return [];
      if (message.key === 'joined') return ['join'];
      if (message.key !== 'guessed') return [];
      const view = after.view;
      const own = view?.participants.find((entry) => entry.id === view.you.id)?.nickname;
      // The own guess already has its sound, from the feedback that came with it.
      return message.params.name === own ? [] : ['correctOther'];
    }
    case 'room.state': {
      const previous = before.view;
      const view = after.view;
      // A first snapshot is not a change of phase.
      if (!previous || !view) return [];
      const turnStarts =
        view.phase === 'choosing' &&
        (previous.phase !== 'choosing' || previous.drawerId !== view.drawerId);
      if (turnStarts) return view.drawerId === view.you.id ? ['yourTurn'] : [];
      if (previous.phase === view.phase) return [];
      if (view.phase === 'turnEnd') return ['turnEnd'];
      if (view.phase === 'gameEnd') return ['win'];
      return [];
    }
    default:
      return [];
  }
}

/** Whether the second now shown on the timer gets a tick. */
export function isTickSecond(phase: Phase, secondsLeft: number): boolean {
  return phase === 'drawing' && secondsLeft >= 1 && secondsLeft <= TICK_SECONDS;
}
