import type {
  Difficulty,
  ErrorCode,
  Language,
  SystemMessageKey,
  TurnEndReason,
} from '@kritzel/shared';
import { create } from 'zustand';
import { DICTIONARIES } from './dictionaries.js';
import { interpolate, type MessageParams } from './interpolate.js';
import { DEFAULT_LANGUAGE, detectLanguage } from './language.js';
import type { MessageKey } from './messages.js';

export type { MessageKey, Messages } from './messages.js';
export type { MessageParams };

/** Compile-time proof that a family of keys built from protocol values is complete. */
type Defined<Key extends MessageKey> = Key;
export type ErrorMessageKey = Defined<`error.${ErrorCode}`>;
export type SystemMessageTextKey = Defined<`system.${SystemMessageKey}`>;
export type TurnEndReasonKey = Defined<`turnEnd.reason.${TurnEndReason}`>;
export type DifficultyKey = Defined<`difficulty.${Difficulty}`>;
export type LanguageNameKey = Defined<`language.${Language}`>;

const LANGUAGE_KEY = 'kritzel.language';

/** In the browser: the stored choice or the browser's language. Elsewhere (tests): English. */
function initialLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    // Storage is blocked: detection falls back to the browser's languages.
  }
  return detectLanguage(window.navigator.languages ?? [], stored);
}

/**
 * The active interface language. `App` subscribes to it and re-renders the
 * whole tree on a change, so every `t()` call picks up the new language at
 * once; components therefore must not cache translated text outside render.
 */
export const useLanguageStore = create<{ language: Language }>(() => ({
  language: initialLanguage(),
}));

/** Reflects the language on `<html lang>` for assistive technology and hyphenation. */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = useLanguageStore.getState().language;
}

/** Switches the interface language and remembers the choice (spec 006, AC-006-02). */
export function setLanguage(language: Language): void {
  useLanguageStore.setState({ language });
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // The choice then lasts for this visit only.
  }
  applyDocumentLanguage();
}

export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(DICTIONARIES[useLanguageStore.getState().language][key], params);
}
