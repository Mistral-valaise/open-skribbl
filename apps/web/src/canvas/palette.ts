/**
 * The drawing palette (docs/DESIGN.md §3): 24 colours in three rows of eight.
 * Together with the token file this is the only place with raw colour values.
 */
export const PALETTE_ROWS = [
  ['#FFFFFF', '#D4D7E0', '#FFD9B8', '#FFB3C7', '#FFE873', '#9BDB4D', '#4DB8FF', '#9B5DE5'],
  ['#8B90A3', '#4A4E5E', '#E0A070', '#FF6FAE', '#FFC53D', '#2FB56A', '#2F6BFF', '#5B4BDB'],
  ['#14151C', '#4E3222', '#8A5A3C', '#E5383B', '#FF8A3D', '#1E6B45', '#1FA6A0', '#1D2A6B'],
] as const;

export const PALETTE: readonly string[] = PALETTE_ROWS.flat();

/** Column by column: light, mid and deep of each hue next to each other. */
export const PALETTE_BY_COLUMN: readonly string[] = PALETTE_ROWS[0].flatMap((_, column) =>
  PALETTE_ROWS.map((row) => row[column]!),
);

export const DEFAULT_COLOR = '#14151C';

export type Rgb = readonly [red: number, green: number, blue: number];

/** Parses `#RRGGBB`; anything else is treated as black. */
export function hexToRgb(color: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}
