/**
 * WCAG 2.1 contrast arithmetic over the design tokens (spec 011, AC-011-11).
 * Used by the contrast test; kept free of DOM access.
 */

export type TokenSet = Readonly<Record<string, string>>;

const HEX = /^#[0-9a-f]{6}$/i;

function declarations(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const value = match[2]!.trim();
    if (HEX.test(value)) tokens[match[1]!] = value.toLowerCase();
  }
  return tokens;
}

/** Reads the colour tokens of both themes from the token file. Light inherits what it does not override. */
export function parseTokens(css: string): { dark: TokenSet; light: TokenSet } {
  const dark = /:root\s*\{([^}]*)\}/.exec(css)?.[1];
  const light = /:root\[data-theme='light'\]\s*\{([^}]*)\}/.exec(css)?.[1];
  if (dark === undefined || light === undefined) throw new Error('token blocks not found');
  const darkTokens = declarations(dark);
  return { dark: darkTokens, light: { ...darkTokens, ...declarations(light) } };
}

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as unknown as Rgb;
}

/** `foreground` at `alpha` over an opaque `background`, as the browser composites it. */
export function blend(foreground: string, background: string, alpha: number): string {
  const top = toRgb(foreground);
  const bottom = toRgb(background);
  const mixed = top.map((channel, index) =>
    Math.round(channel * alpha + bottom[index]! * (1 - alpha)),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [red, green, blue] = toRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as unknown as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast ratio of two opaque colours, 1…21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
