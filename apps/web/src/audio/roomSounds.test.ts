import {
  defaultSettings,
  type ParticipantView,
  type Phase,
  type RoomView,
  type ServerMessage,
} from '@kritzel/shared';
import { describe, expect, it } from 'vitest';
import { INITIAL_ROOM_DATA, reduceServerMessage, type RoomData } from '../store/roomReducer.js';
import { isTickSecond, soundEventsFor } from './roomSounds.js';
import { SOUND_EVENTS } from './soundPlayer.js';

const player = (id: string, nickname: string): ParticipantView => ({
  id,
  nickname,
  avatar: { body: 0, eyes: 0, mouth: 0, accessory: 0 },
  role: 'player',
  connected: true,
  waiting: false,
  score: 0,
  rank: 1,
  hasGuessed: false,
});

function view(phase: Phase, patch: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234',
    phase,
    hostId: 'p1',
    you: { id: 'p2', role: 'player', like: null },
    settings: defaultSettings(),
    customWordCount: 0,
    participants: [player('p1', 'Mara'), player('p2', 'Noa')],
    round: 1,
    totalRounds: 3,
    drawerId: 'p1',
    mask: null,
    word: null,
    phaseEndsAt: null,
    serverNow: 0,
    turnEnd: null,
    results: null,
    ...patch,
  };
}

const state = (phase: Phase, patch: Partial<RoomView> = {}): ServerMessage => ({
  type: 'room.state',
  state: view(phase, patch),
});

/** The effects of the last message, after the earlier ones set the scene. */
function soundsOf(messages: ServerMessage[]): string[] {
  let data: RoomData = INITIAL_ROOM_DATA;
  let sounds: string[] = [];
  for (const message of messages) {
    const next = reduceServerMessage(data, message, 0).data;
    sounds = soundEventsFor(data, next, message);
    data = next;
  }
  return sounds;
}

const system = (key: 'joined' | 'guessed' | 'left', name: string): ServerMessage => ({
  type: 'chat.message',
  id: 1,
  kind: 'system',
  channel: 'all',
  key,
  params: { name },
});

describe('soundEventsFor', () => {
  it('AC-011-04: each of the seven sound events has its trigger', () => {
    const triggered = [
      ...soundsOf([state('lobby'), system('joined', 'Mara')]),
      ...soundsOf([state('turnEnd'), state('choosing', { drawerId: 'p2' })]),
      ...soundsOf([state('drawing'), { type: 'guess.feedback', kind: 'correct', text: 'house' }]),
      ...soundsOf([state('drawing'), system('guessed', 'Mara')]),
      ...(isTickSecond('drawing', 10) ? ['tick'] : []),
      ...soundsOf([state('drawing'), state('turnEnd')]),
      ...soundsOf([state('turnEnd'), state('gameEnd')]),
    ];
    expect(triggered).toEqual([...SOUND_EVENTS]);
  });

  it('AC-011-04: "your turn" sounds for the drawer only, also when a turn is skipped', () => {
    expect(soundsOf([state('turnEnd'), state('choosing', { drawerId: 'p1' })])).toEqual([]);
    expect(soundsOf([state('lobby'), state('choosing', { drawerId: 'p2' })])).toEqual(['yourTurn']);
    expect(
      soundsOf([state('choosing', { drawerId: 'p1' }), state('choosing', { drawerId: 'p2' })]),
    ).toEqual(['yourTurn']);
    // Another snapshot of the same choosing phase is not a new turn.
    expect(
      soundsOf([state('choosing', { drawerId: 'p2' }), state('choosing', { drawerId: 'p2' })]),
    ).toEqual([]);
  });

  it('AC-011-04: the own correct guess sounds once, not also as another player’s', () => {
    expect(soundsOf([state('drawing'), system('guessed', 'Noa')])).toEqual([]);
    expect(soundsOf([state('drawing'), system('guessed', 'Mara')])).toEqual(['correctOther']);
    expect(
      soundsOf([state('drawing'), { type: 'guess.feedback', kind: 'close', text: 'hose' }]),
    ).toEqual([]);
  });

  it('AC-011-04: nothing sounds for a snapshot without a change of phase, or on (re)joining', () => {
    expect(soundsOf([state('drawing'), state('drawing')])).toEqual([]);
    expect(soundsOf([state('turnEnd')])).toEqual([]);
    expect(
      soundsOf([
        state('drawing'),
        {
          type: 'joined',
          participantId: 'p2',
          sessionToken: 't',
          state: view('turnEnd'),
          items: [],
          redo: [],
        },
      ]),
    ).toEqual([]);
    expect(soundsOf([state('lobby'), system('left', 'Mara')])).toEqual([]);
  });

  it('AC-011-04: the tick sounds for each of the last ten seconds of the drawing phase', () => {
    const ticking = Array.from({ length: 13 }, (_, seconds) => seconds).filter((seconds) =>
      isTickSecond('drawing', seconds),
    );
    expect(ticking).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(isTickSecond('choosing', 5)).toBe(false);
    expect(isTickSecond('turnEnd', 3)).toBe(false);
  });
});
