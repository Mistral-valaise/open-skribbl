import { AVATAR_PARTS, NICKNAME_MAX_LENGTH } from './constants.js';

export interface Avatar {
  body: number;
  eyes: number;
  mouth: number;
  accessory: number;
}

const NICKNAME_CHARS = /^[\p{L}\p{N} _.-]+$/u;

/** Returns the cleaned nickname, or null when it is invalid (spec 010). */
export function cleanNickname(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const length = Array.from(cleaned).length;
  if (length < 1 || length > NICKNAME_MAX_LENGTH) return null;
  return NICKNAME_CHARS.test(cleaned) ? cleaned : null;
}

/** Appends the lowest free number from 2 when the nickname is taken (case-insensitive). */
export function uniqueNickname(nickname: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(nickname.toLowerCase())) return nickname;
  for (let n = 2; ; n += 1) {
    const candidate = `${nickname} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export function isValidAvatar(avatar: unknown): avatar is Avatar {
  if (typeof avatar !== 'object' || avatar === null) return false;
  const record = avatar as Record<string, unknown>;
  return (Object.keys(AVATAR_PARTS) as (keyof Avatar)[]).every((part) => {
    const value = record[part];
    return (
      Number.isInteger(value) && (value as number) >= 0 && (value as number) < AVATAR_PARTS[part]
    );
  });
}

export function randomAvatar(random: () => number): Avatar {
  const pick = (count: number) => Math.floor(random() * count);
  return {
    body: pick(AVATAR_PARTS.body),
    eyes: pick(AVATAR_PARTS.eyes),
    mouth: pick(AVATAR_PARTS.mouth),
    accessory: pick(AVATAR_PARTS.accessory),
  };
}
