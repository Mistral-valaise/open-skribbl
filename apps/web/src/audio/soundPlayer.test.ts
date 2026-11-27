import { describe, expect, it } from 'vitest';
import {
  MUTED_STORAGE_KEY,
  SOUND_EVENTS,
  SoundPlayer,
  type AudioOutput,
  type SoundStorage,
} from './soundPlayer.js';

/** A stand-in for `AudioContext` that records what would sound. */
function fakeAudio() {
  const started: { frequency: number; from: number; until: number }[] = [];
  let created = 0;
  const param = (onSet?: (value: number) => void) => ({
    setValueAtTime: (value: number) => onSet?.(value),
    linearRampToValueAtTime: () => undefined,
  });
  const create = (): AudioOutput => {
    created += 1;
    return {
      currentTime: 2,
      destination: {},
      state: 'running',
      createGain: () => ({ gain: param(), connect: () => undefined }),
      createOscillator: () => {
        const tone = { frequency: 0, from: 0, until: 0 };
        return {
          type: 'sine',
          frequency: param((value) => (tone.frequency = value)),
          connect: () => undefined,
          start: (time: number) => {
            tone.from = time;
            started.push(tone);
          },
          stop: (time: number) => (tone.until = time),
        };
      },
    };
  };
  return { create, started, contexts: () => created };
}

function memoryStorage(): SoundStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('SoundPlayer', () => {
  it('AC-011-04: each of the seven sound events plays its effect when unmuted', () => {
    expect(SOUND_EVENTS).toHaveLength(7);
    const signatures = new Set<string>();
    for (const event of SOUND_EVENTS) {
      const audio = fakeAudio();
      const player = new SoundPlayer(audio.create, memoryStorage());
      player.unlock();
      expect(player.play(event), event).toBe(true);
      expect(audio.started.length, event).toBeGreaterThan(0);
      for (const tone of audio.started) {
        expect(tone.frequency).toBeGreaterThan(100);
        expect(tone.from).toBeGreaterThanOrEqual(2);
        expect(tone.until).toBeGreaterThan(tone.from);
        // Effects are short: nothing sounds for longer than a second.
        expect(tone.until - 2).toBeLessThan(1);
      }
      signatures.add(audio.started.map((tone) => `${tone.frequency}@${tone.from}`).join(','));
    }
    // Seven events, seven different effects.
    expect(signatures.size).toBe(7);
  });

  it('AC-011-04: no event plays while muted', () => {
    const audio = fakeAudio();
    const player = new SoundPlayer(audio.create, memoryStorage());
    player.unlock();
    player.setMuted(true);
    for (const event of SOUND_EVENTS) expect(player.play(event), event).toBe(false);
    expect(audio.started).toHaveLength(0);
    expect(audio.contexts()).toBe(0);

    player.setMuted(false);
    expect(player.play('join')).toBe(true);
    expect(audio.started.length).toBeGreaterThan(0);
  });

  it('AC-011-04: sound is on by default and the muted state survives a reload', () => {
    const storage = memoryStorage();
    const first = new SoundPlayer(fakeAudio().create, storage);
    expect(first.muted).toBe(false);
    first.setMuted(true);
    expect(storage.values.get(MUTED_STORAGE_KEY)).toBe('1');

    // A reload: a new player over the same storage.
    const reloaded = new SoundPlayer(fakeAudio().create, storage);
    expect(reloaded.muted).toBe(true);
    reloaded.setMuted(false);
    expect(new SoundPlayer(fakeAudio().create, storage).muted).toBe(false);
  });

  it('AC-011-05: no audio context is created before the first user interaction', () => {
    const audio = fakeAudio();
    const player = new SoundPlayer(audio.create, memoryStorage());
    expect(audio.contexts()).toBe(0);
    for (const event of SOUND_EVENTS) expect(player.play(event)).toBe(false);
    expect(audio.contexts()).toBe(0);
    expect(audio.started).toHaveLength(0);

    // The interaction alone creates nothing either; the first effect after it does, once.
    player.unlock();
    expect(audio.contexts()).toBe(0);
    player.play('tick');
    player.play('join');
    expect(audio.contexts()).toBe(1);
  });

  it('AC-011-05: a suspended context is resumed, and a missing one keeps the game silent', () => {
    let resumed = 0;
    const audio = fakeAudio();
    const suspended = new SoundPlayer(
      () => ({ ...audio.create(), state: 'suspended', resume: async () => void (resumed += 1) }),
      null,
    );
    suspended.unlock();
    expect(suspended.play('join')).toBe(true);
    expect(resumed).toBe(1);

    const broken = new SoundPlayer(() => {
      throw new Error('Web Audio is not available');
    }, null);
    broken.unlock();
    expect(broken.play('join')).toBe(false);
  });

  it('works when storage is blocked', () => {
    const blocked: SoundStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const player = new SoundPlayer(fakeAudio().create, blocked);
    expect(player.muted).toBe(false);
    player.setMuted(true);
    expect(player.muted).toBe(true);
  });
});
