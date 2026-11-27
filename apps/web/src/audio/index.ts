import { create } from 'zustand';
import { SoundPlayer, type AudioOutput, type SoundEvent } from './soundPlayer.js';

export type { SoundEvent } from './soundPlayer.js';

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The app's one sound player; the audio context is created when the first effect sounds. */
const player = new SoundPlayer(
  () => new AudioContext() as unknown as AudioOutput,
  typeof window === 'undefined' ? null : browserStorage(),
);

export const useSoundStore = create<{ muted: boolean }>(() => ({ muted: player.muted }));

export function setMuted(muted: boolean): void {
  player.setMuted(muted);
  useSoundStore.setState({ muted });
}

export function playSound(event: SoundEvent): void {
  player.play(event);
}

/** Lets sounds play from the first pointer or key press on (spec 011, AC-011-05). */
export function unlockSoundOnFirstInteraction(): void {
  const unlock = () => {
    player.unlock();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
