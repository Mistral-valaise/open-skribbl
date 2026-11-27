import { z } from 'zod';
import { CHAT_MAX_LENGTH, CUSTOM_WORDS_MAX, REACTION_EMOJI, WORD_MAX_LENGTH } from './constants.js';
import { drawOpSchema, type DrawItem, type DrawOp } from './drawing.js';
import type { Avatar } from './identity.js';

/**
 * Client/server message protocol (docs/ARCHITECTURE.md §4). This file is the
 * authoritative definition. Client and server refuse to talk when their
 * versions differ.
 */
export const PROTOCOL_VERSION = 1;

export const LANGUAGES = ['en', 'de', 'es', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Role = 'player' | 'spectator';
export type Phase = 'lobby' | 'choosing' | 'drawing' | 'turnEnd' | 'gameEnd';
export type TurnEndReason = 'time_up' | 'all_guessed' | 'drawer_left' | 'not_enough_players';

/** Spec 001, "Settings". */
export const settingsSchema = z.object({
  language: z.enum(LANGUAGES),
  rounds: z.number().int().min(1).max(10),
  drawTime: z
    .number()
    .int()
    .min(30)
    .max(180)
    .refine((value) => value % 10 === 0, 'steps of 10'),
  wordChoices: z.number().int().min(2).max(5),
  hints: z.number().int().min(0).max(5),
  difficulty: z.enum(DIFFICULTIES),
  maxPlayers: z.number().int().min(2).max(12),
  customWords: z.array(z.string().min(1).max(WORD_MAX_LENGTH)).max(CUSTOM_WORDS_MAX),
  customWordsOnly: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(language: Language = 'en'): Settings {
  return {
    language,
    rounds: 3,
    drawTime: 80,
    wordChoices: 3,
    hints: 2,
    difficulty: 'mixed',
    maxPlayers: 8,
    customWords: [],
    customWordsOnly: false,
  };
}

const avatarSchema = z.object({
  body: z.number(),
  eyes: z.number(),
  mouth: z.number(),
  accessory: z.number(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    protocolVersion: z.number(),
    roomCode: z.string().max(32),
    nickname: z.string().max(64),
    avatar: avatarSchema,
    role: z.enum(['player', 'spectator']),
    clientId: z.string().min(8).max(64),
    sessionToken: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('settings.update'), settings: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('game.start') }),
  z.object({ type: z.literal('game.playAgain') }),
  z.object({ type: z.literal('player.kick'), playerId: z.string().max(32) }),
  z.object({ type: z.literal('word.choose'), index: z.number().int().min(0).max(9) }),
  z.object({ type: z.literal('draw.op'), op: drawOpSchema }),
  // Length is checked by the rules so the sender gets `invalid_message` (spec 004).
  z.object({ type: z.literal('chat.send'), text: z.string().max(CHAT_MAX_LENGTH * 20) }),
  z.object({ type: z.literal('reaction.send'), emoji: z.enum(REACTION_EMOJI) }),
  z.object({ type: z.literal('like.set'), value: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('gallery.get'), turnIndex: z.number().int().min(0).max(10_000) }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type JoinMessage = Extract<ClientMessage, { type: 'join' }>;

export type ErrorCode =
  | 'bad_request'
  | 'version_mismatch'
  | 'room_not_found'
  | 'room_full'
  | 'server_full'
  | 'kicked'
  | 'replaced'
  | 'invalid_nickname'
  | 'invalid_avatar'
  | 'not_allowed'
  | 'not_enough_players'
  | 'invalid_settings'
  | 'invalid_custom_words'
  | 'invalid_message'
  | 'message_blocked'
  | 'rate_limited'
  | 'drawing_limit'
  | 'invalid_op';

export type SystemMessageKey =
  'joined' | 'left' | 'guessed' | 'turn_ended' | 'drawer_left' | 'new_host' | 'kicked';

export type ChatChannel = 'all' | 'guessed';
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];
export type LikeValue = 'up' | 'down';

/** One drawing of the finished game (spec 008). */
export interface GalleryEntry {
  turnIndex: number;
  round: number;
  drawerId: string;
  drawerName: string;
  word: string;
  likesUp: number;
  likesDown: number;
  guessedCount: number;
  guesserCount: number;
}

export type ChatMessage =
  | {
      type: 'chat.message';
      id: number;
      kind: 'chat';
      channel: ChatChannel;
      from: string;
      name: string;
      text: string;
    }
  | {
      type: 'chat.message';
      id: number;
      kind: 'system';
      channel: 'all';
      key: SystemMessageKey;
      params: Record<string, string>;
    };

export interface ParticipantView {
  id: string;
  nickname: string;
  avatar: Avatar;
  role: Role;
  connected: boolean;
  /** Joined during the current turn and watches until the next one (spec 007). */
  waiting: boolean;
  score: number;
  /** Null for spectators. */
  rank: number | null;
  hasGuessed: boolean;
}

export interface RankingEntry {
  id: string;
  nickname: string;
  avatar: Avatar;
  score: number;
  rank: number;
  left: boolean;
}

/** What one participant may see of the room (spec 002, "Snapshot contents"). */
export interface RoomView {
  code: string;
  phase: Phase;
  hostId: string | null;
  you: { id: string; role: Role };
  /** `customWords` is filled for the host only; everyone gets the count. */
  settings: Settings;
  customWordCount: number;
  participants: ParticipantView[];
  round: number;
  totalRounds: number;
  drawerId: string | null;
  /** Present from the drawing phase on. */
  mask: string | null;
  /** The secret word, only for those allowed to see it. */
  word: string | null;
  phaseEndsAt: number | null;
  serverNow: number;
  turnEnd: {
    reason: TurnEndReason;
    deltas: Record<string, number>;
    /** Like totals for the drawing; individual likes are never disclosed. */
    likes: { up: number; down: number };
  } | null;
  results: {
    ranking: RankingEntry[];
    gallery: GalleryEntry[];
    /** `turnIndex` of the crowd favourite, or null when no drawing got a thumbs-up. */
    favorite: number | null;
  } | null;
}

export type ServerMessage =
  | {
      type: 'joined';
      participantId: string;
      sessionToken: string;
      state: RoomView;
      /** Effective drawing items of the current turn. */
      items: readonly DrawItem[];
      /** Undone items, so a resumed drawer can still redo them. */
      redo: readonly DrawItem[];
    }
  | { type: 'room.state'; state: RoomView }
  | { type: 'word.choices'; words: string[] }
  | { type: 'draw.op'; op: DrawOp }
  | ChatMessage
  | { type: 'guess.feedback'; kind: 'correct' | 'close'; text: string }
  | { type: 'reaction'; participantId: string; emoji: ReactionEmoji }
  | { type: 'gallery.drawing'; turnIndex: number; items: readonly DrawItem[] }
  | { type: 'kicked' }
  | { type: 'server.shutdown' }
  | { type: 'error'; code: ErrorCode };
