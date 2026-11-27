import { LANGUAGES, type Language } from '@kritzel/shared';

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * The interface language to start with (spec 006, "Interface languages"): the
 * stored choice when there is one, otherwise the first browser language whose
 * primary subtag is supported, otherwise English.
 */
export function detectLanguage(
  browserLanguages: readonly string[],
  stored: string | null,
): Language {
  if (isLanguage(stored)) return stored;
  for (const tag of browserLanguages) {
    const primary = tag.split('-')[0]?.toLowerCase();
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
