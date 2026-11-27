/**
 * Sound effects synthesised with the Web Audio API (spec 011, DESIGN §7): no
 * audio files, nothing before the first user interaction, one mute switch.
 * The audio context comes from a factory, so the player runs without a browser.
 */

export const SOUND_EVENTS = [
  'join',
  'yourTurn',
  'correctSelf',
  'correctOther',
  'tick',
  'turnEnd',
  'win',
] as const;
export type SoundEvent = (typeof SOUND_EVENTS)[number];

type Wave = 'sine' | 'triangle' | 'square';

/** One note of an effect: when it starts, how long it sounds and how loud it is. */
interface Tone {
  frequency: number;
  /** Seconds after the effect starts. */
  at: number;
  /** Seconds. */
  length: number;
  wave: Wave;
  /** Peak level, 0…1, before the master volume. */
  level: number;
}

const note = (frequency: number, at: number, length: number, wave: Wave = 'sine', level = 1) =>
  ({ frequency, at, length, wave, level }) satisfies Tone;

/** Short, soft and distinct: none is longer than a second. */
const EFFECTS: Readonly<Record<SoundEvent, readonly Tone[]>> = {
  join: [note(523.25, 0, 0.09, 'triangle', 0.7), note(783.99, 0.09, 0.14, 'triangle', 0.7)],
  yourTurn: [
    note(659.25, 0, 0.1, 'triangle'),
    note(880, 0.11, 0.1, 'triangle'),
    note(1174.66, 0.22, 0.22, 'triangle'),
  ],
  correctSelf: [note(783.99, 0, 0.1), note(1046.5, 0.1, 0.1), note(1318.51, 0.2, 0.28)],
  correctOther: [note(659.25, 0, 0.08, 'sine', 0.6), note(987.77, 0.08, 0.16, 'sine', 0.6)],
  tick: [note(1000, 0, 0.04, 'square', 0.25)],
  turnEnd: [note(587.33, 0, 0.14, 'triangle', 0.8), note(392, 0.14, 0.3, 'triangle', 0.8)],
  win: [
    note(523.25, 0, 0.12, 'triangle'),
    note(659.25, 0.12, 0.12, 'triangle'),
    note(783.99, 0.24, 0.12, 'triangle'),
    note(1046.5, 0.36, 0.45, 'triangle'),
  ],
};

/** Moderate by default (DESIGN §7). */
const MASTER_VOLUME = 0.16;
/** Fade in and out of each note, in seconds, so no note clicks. */
const FADE = 0.012;

interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

interface OscillatorLike {
  type: string;
  frequency: AudioParamLike;
  connect(destination: unknown): unknown;
  start(time: number): void;
  stop(time: number): void;
}

interface GainLike {
  gain: AudioParamLike;
  connect(destination: unknown): unknown;
}

/** The part of `AudioContext` the player needs. */
export interface AudioOutput {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  resume?(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

/** The part of `Storage` the player needs. */
export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MUTED_STORAGE_KEY = 'kritzel.muted';

export class SoundPlayer {
  private output: AudioOutput | null = null;
  private unlocked = false;
  private mutedState: boolean;

  constructor(
    private readonly createOutput: () => AudioOutput,
    private readonly storage: SoundStorage | null,
  ) {
    this.mutedState = this.read() === '1';
  }

  /** Unmuted by default; the choice is remembered. */
  get muted(): boolean {
    return this.mutedState;
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    try {
      this.storage?.setItem(MUTED_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // The choice then lasts for this visit only.
    }
  }

  /** To be called on the first user interaction; before it nothing can sound. */
  unlock(): void {
    this.unlocked = true;
  }

  /** Plays an effect. Returns false when it stays silent: muted, or no interaction yet. */
  play(event: SoundEvent): boolean {
    if (this.mutedState || !this.unlocked) return false;
    let output: AudioOutput;
    try {
      // The context is created on the first effect that actually sounds.
      output = this.output ??= this.createOutput();
      if (output.state === 'suspended') void output.resume?.();
    } catch {
      return false;
    }
    const start = output.currentTime + 0.01;
    for (const tone of EFFECTS[event]) {
      const from = start + tone.at;
      const until = from + tone.length;
      const peak = tone.level * MASTER_VOLUME;
      const gain = output.createGain();
      gain.gain.setValueAtTime(0, from);
      gain.gain.linearRampToValueAtTime(peak, from + FADE);
      gain.gain.setValueAtTime(peak, Math.max(from + FADE, until - FADE));
      gain.gain.linearRampToValueAtTime(0, until);
      gain.connect(output.destination);

      const oscillator = output.createOscillator();
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.frequency, from);
      oscillator.connect(gain);
      oscillator.start(from);
      oscillator.stop(until + 0.02);
    }
    return true;
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(MUTED_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
}
