import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { otherTheme, resolveTheme, THEME_STORAGE_KEY } from './theme.js';

/** Runs `public/theme.js` against a stand-in for the browser and returns the theme it applied. */
function runHeadScript(stored: string | null | Error, prefersLight: boolean): string | undefined {
  const source = readFileSync(new URL('../../public/theme.js', import.meta.url), 'utf8');
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (stored instanceof Error) throw stored;
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === '(prefers-color-scheme: light)' && prefersLight,
  });
  new Function('document', 'localStorage', 'matchMedia', source)(
    document,
    localStorage,
    matchMedia,
  );
  return attributes['data-theme'];
}

describe('theme', () => {
  it('AC-011-01: with no stored choice the system preference decides', () => {
    expect(resolveTheme(null, false)).toBe('dark');
    expect(resolveTheme(null, true)).toBe('light');
    expect(runHeadScript(null, false)).toBe('dark');
    expect(runHeadScript(null, true)).toBe('light');
  });

  it('AC-011-02: the stored choice wins and is applied by the script in <head>', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(runHeadScript('light', false)).toBe('light');
    expect(runHeadScript('dark', true)).toBe('dark');
  });

  it('AC-011-02: an unusable stored value falls back to the system preference', () => {
    expect(resolveTheme('sepia', true)).toBe('light');
    expect(runHeadScript('sepia', false)).toBe('dark');
    expect(runHeadScript(new Error('storage blocked'), true)).toBe('light');
  });

  it('toggles between the two themes', () => {
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });
});
