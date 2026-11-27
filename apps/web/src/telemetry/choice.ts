import { RUM } from '@kritzel/shared';

/**
 * The player's choice for browser measurements (spec 015): a preference in
 * the browser's storage, like the theme. Off unless the player switched it on.
 */

/** The part of `Storage` the choice needs. */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const ON = 'on';
const OFF = 'off';

/** Only a stored "on" counts; no value, another value or blocked storage all mean off. */
export function readChoice(storage: ChoiceStorage | null): boolean {
  try {
    return storage?.getItem(RUM.storageKey) === ON;
  } catch {
    return false;
  }
}

export function writeChoice(storage: ChoiceStorage | null, on: boolean): void {
  try {
    storage?.setItem(RUM.storageKey, on ? ON : OFF);
  } catch {
    // The choice then lasts for this visit only.
  }
}
