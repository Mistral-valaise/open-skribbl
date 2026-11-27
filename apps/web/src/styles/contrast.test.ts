import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, parseTokens, type TokenSet } from './contrast.js';

const themes = parseTokens(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8'));

/** WCAG 2.1 AA (DESIGN §3): body text 4.5:1, large text and interface glyphs 3:1. */
const TEXT = 4.5;
const GLYPH = 3;

/** A surface: a token, or a token tinted with another one at the given opacity (`bg-accent/15`). */
type Surface = string | { tint: string; alpha: number; over: string };

const surfaceColor = (tokens: TokenSet, surface: Surface): string =>
  typeof surface === 'string'
    ? tokens[surface]!
    : blend(tokens[surface.tint]!, tokens[surface.over]!, surface.alpha);

const describeSurface = (surface: Surface): string =>
  typeof surface === 'string'
    ? surface
    : `${surface.tint} at ${surface.alpha * 100} % over ${surface.over}`;

const tint = (name: string, alpha: number, over: string): Surface => ({ tint: name, alpha, over });

/**
 * Every pairing of a text or glyph token with a surface that the components
 * use, with the place it comes from. Add a line here when a component starts
 * to put a colour on a surface it has not been on before.
 */
const PAIRS: readonly (readonly [
  foreground: string,
  surface: Surface,
  minimum: number,
  use: string,
])[] = [
  // Body and headings
  ['--text-primary', '--bg-base', TEXT, 'page text'],
  ['--text-primary', '--bg-raised', TEXT, 'panels'],
  ['--text-primary', '--bg-overlay', TEXT, 'inputs, player tiles, toast'],
  ['--text-primary', '--bg-hover', TEXT, 'hovered buttons and rows'],
  ['--text-primary', tint('--accent', 0.1, '--bg-raised'), TEXT, 'own row, guessed-channel chat'],
  ['--text-primary', tint('--success', 0.1, '--bg-raised'), TEXT, 'scoreboard row of a guesser'],
  ['--text-primary', tint('--success', 0.1, '--bg-base'), TEXT, 'scoreboard chip on phones'],
  ['--text-primary', tint('--danger', 0.1, '--bg-base'), TEXT, 'join error box'],
  // Labels and metadata
  ['--text-secondary', '--bg-base', TEXT, 'tagline, captions under the canvas'],
  ['--text-secondary', '--bg-raised', TEXT, 'labels in panels'],
  ['--text-secondary', '--bg-overlay', TEXT, 'invite link, stepper labels'],
  ['--text-secondary', '--bg-hover', TEXT, 'tags, turn-end reason'],
  ['--text-secondary', tint('--danger', 0.1, '--bg-base'), TEXT, 'join error details'],
  // Placeholders, captions, quiet icons
  ['--text-muted', '--bg-base', TEXT, 'footer, free seats'],
  ['--text-muted', '--bg-raised', TEXT, 'captions in panels, ranks'],
  ['--text-muted', '--bg-overlay', TEXT, 'placeholders in inputs'],
  // Accent
  ['--accent-text', '--bg-base', TEXT, 'links'],
  ['--accent-text', '--bg-raised', TEXT, '"You", own chat name, drawer badge'],
  ['--accent-text', '--bg-overlay', TEXT, 'pressed icon buttons'],
  ['--accent-text', tint('--accent', 0.1, '--bg-raised'), TEXT, 'guessed-channel chat, own row'],
  ['--accent-text', tint('--accent', 0.15, '--bg-raised'), TEXT, 'pressed tool buttons'],
  ['--accent-text', tint('--accent', 0.15, '--bg-overlay'), TEXT, '"You" tag on a player tile'],
  ['--accent-text', tint('--accent', 0.15, '--bg-base'), TEXT, 'presence note under the canvas'],
  ['--on-accent', '--accent', TEXT, 'primary buttons, selected language'],
  ['--on-accent', '--accent-hover', TEXT, 'hovered primary buttons'],
  // Semantic colours always come with an icon or text of their own
  ['--success', '--bg-raised', TEXT, 'point deltas, guessed check'],
  ['--success', tint('--success', 0.1, '--bg-raised'), TEXT, '"guessed the word" in the chat'],
  ['--success', tint('--success', 0.15, '--bg-raised'), TEXT, 'own correct guess in the chat'],
  ['--success', tint('--success', 0.1, '--bg-base'), TEXT, 'guessed chip on phones'],
  ['--warning', '--bg-raised', TEXT, 'host crown, favourite badge, first place'],
  ['--warning', '--bg-overlay', TEXT, 'reconnecting spinner, toast icon'],
  ['--warning', tint('--warning', 0.1, '--bg-raised'), TEXT, 'close guess in the chat'],
  ['--warning', tint('--warning', 0.15, '--bg-overlay'), TEXT, 'host tag on a player tile'],
  ['--danger', '--bg-base', TEXT, 'form errors on the page'],
  ['--danger', '--bg-raised', TEXT, 'form errors in panels, kicked notice in the chat'],
  ['--danger', '--bg-overlay', TEXT, 'hovered kick button on a player tile'],
  ['--info', '--bg-raised', TEXT, 'system messages in the chat'],
  // Interface glyphs
  ['--accent', '--bg-base', GLYPH, 'focus ring on the page'],
  ['--accent', '--bg-raised', GLYPH, 'timer ring, focus ring in panels'],
  ['--accent', '--bg-overlay', GLYPH, 'focus ring on inputs'],
  ['--warning', '--bg-raised', GLYPH, 'timer ring in the last ten seconds'],
  // The canvas is paper in both themes
  ['--ink', '--paper', TEXT, 'default brush on the canvas'],
  [blendedInk(), '--paper', GLYPH, 'loading spinner on a gallery card'],
];

/** `text-ink/60`: the ink at 60 % over paper, written as a ready colour. */
function blendedInk(): string {
  return blend(themes.dark['--ink']!, themes.dark['--paper']!, 0.6);
}

const colorOf = (tokens: TokenSet, foreground: string) =>
  foreground.startsWith('#') ? foreground : tokens[foreground]!;

describe('design tokens', () => {
  for (const [theme, tokens] of Object.entries(themes)) {
    it(`AC-011-11: every text and background pair in use meets WCAG AA in the ${theme} theme`, () => {
      const failures = PAIRS.flatMap(([foreground, surface, minimum, use]) => {
        const ratio = contrastRatio(colorOf(tokens, foreground), surfaceColor(tokens, surface));
        return ratio >= minimum
          ? []
          : [
              `${foreground} on ${describeSurface(surface)} (${use}): ${ratio.toFixed(2)} < ${minimum}`,
            ];
      });
      expect(failures).toEqual([]);
    });

    it(`AC-011-11: avatar features are legible on all twelve body colours in the ${theme} theme`, () => {
      for (let body = 0; body < 12; body += 1) {
        const ratio = contrastRatio(tokens['--avatar-ink']!, tokens[`--avatar-body-${body}`]!);
        expect(ratio, `body ${body}`).toBeGreaterThanOrEqual(TEXT);
      }
    });
  }

  it('AC-011-03: the canvas is white paper in both themes', () => {
    expect(themes.dark['--paper']).toBe('#ffffff');
    expect(themes.light['--paper']).toBe('#ffffff');
  });

  it('defines every colour token in both themes', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort());
    for (const name of ['--bg-base', '--text-primary', '--accent', '--success', '--danger']) {
      expect(themes.dark[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('computes WCAG ratios: black on white is 21, a colour on itself is 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#6a5af9', '#6a5af9')).toBe(1);
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
