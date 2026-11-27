/**
 * Every number that appears in a spec is defined here, once.
 * Each group names the spec it comes from.
 */

/** Spec 001 — rooms and lobby. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_SPECTATORS = 8;
export const MIN_PLAYERS_TO_START = 2;

/** Spec 002 and 007 — phase and presence timing, in milliseconds. */
export const TIMING = {
  choosingMs: 15_000,
  turnEndMs: 6_000,
  seatGraceMs: 60_000,
  drawerGraceMs: 10_000,
  tooFewPlayersGraceMs: 10_000,
  emptyRoomMs: 5 * 60_000,
} as const;

/** Spec 007 — client reconnect backoff: the listed delays, then `steadyMs` for every further try. */
export const RECONNECT = { delaysMs: [500, 1_000, 2_000, 4_000], steadyMs: 5_000 } as const;

/** Spec 003 — drawing. */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const CANVAS_BACKGROUND = '#FFFFFF';
export const BRUSH_SIZES = [4, 8, 14, 24, 40] as const;
export const DRAW_LIMITS = {
  pointsPerStroke: 5_000,
  itemsPerTurn: 2_000,
  pointsPerTurn: 200_000,
} as const;
export const FILL_TOLERANCE = 32;
/** Capture: drop points closer than `minPointDistance`, send batches every `batchMs`. */
export const CAPTURE = { minPointDistance: 2, batchMs: 33 } as const;

/** Spec 004 — chat. */
export const CHAT_MAX_LENGTH = 100;

/** Spec 005 — scoring. */
export const SCORING = {
  base: 100,
  timeBonus: 400,
  firstGuessBonus: 50,
  /** The drawer earns the guessers' average divided by this, so a game for two is not a permanent tie. */
  drawerDivisor: 2,
} as const;

/** Spec 006 — words. */
export const WORD_MAX_LENGTH = 30;
export const CUSTOM_WORDS_MAX = 500;
export const CUSTOM_WORDS_ONLY_MIN = 10;

/** Spec 010 — identity. */
export const NICKNAME_MAX_LENGTH = 16;
export const AVATAR_PARTS = { body: 12, eyes: 8, mouth: 8, accessory: 8 } as const;

/** Architecture §4 — transport limits. */
/** Large enough for a settings update carrying 500 custom words. */
export const MAX_FRAME_BYTES = 32 * 1024;
export const RATE_LIMITS = {
  draw: { burst: 90, perSecond: 90 },
  chat: { burst: 5, perSecond: 1 },
  /** Dropped messages within `windowMs` that close the connection. */
  dropsToClose: 50,
  dropWindowMs: 10_000,
} as const;

/** Spec 008 — reactions. */
export const REACTION_EMOJI = ['😂', '😍', '👏', '🔥', '🤔', '💀'] as const;
export const REACTION_COOLDOWN_MS = 1_500;
/** How long a reaction floats over the canvas (design guideline §6). */
export const REACTION_FLOAT_MS = 1_600;
/** Spec 008 — PNG export size. */
export const EXPORT_WIDTH = 1600;
export const EXPORT_HEIGHT = 1200;

/** Spec 009 — solo mode. */
export const SOLO = {
  drawingsPerRun: 10,
  timePerDrawingMs: 30_000,
  replayMs: 15_000,
  strokePauseMs: 150,
  revealMs: 2_500,
  hints: 2,
  /** Run totals kept per language next to the personal best. */
  recentRuns: 5,
  /** Free space kept around a replayed drawing, as a fraction of the canvas. */
  margin: 0.1,
  /** Coordinate range of the dataset drawings. */
  sourceSize: 256,
  color: '#14151C',
  brushSize: 8,
} as const;

/** Spec 015 — browser measurements. */
export const RUM = {
  /** Events in one report. */
  maxEvents: 20,
  /** Size of one report. */
  maxBytes: 4096,
  /** Reports per minute and address. */
  reportsPerMinute: 30,
  /** Largest duration a browser may report, in milliseconds. */
  maxDurationMs: 600_000,
  /** Key of the player's choice in browser storage. */
  storageKey: 'kritzel.rum',
} as const;
