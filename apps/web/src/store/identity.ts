import { isValidAvatar, randomAvatar, type Avatar, type Role } from '@kritzel/shared';

/**
 * Who the player is, kept in the browser only (spec 010, "Storage"): nickname,
 * avatar and `clientId` in `localStorage`, the per-room seat in `sessionStorage`.
 */

const NICKNAME_KEY = 'kritzel.nickname';
const AVATAR_KEY = 'kritzel.avatar';
const CLIENT_ID_KEY = 'kritzel.clientId';
const sessionKey = (roomCode: string) => `kritzel.session.${roomCode}`;

/** Storage can be unavailable (private mode, blocked cookies); the game still works without it. */
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Nothing to do: the value simply does not survive the page.
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** A random lower-case hex string of `bytes * 2` characters. */
export function randomId(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function loadNickname(): string {
  return read(local, NICKNAME_KEY) ?? '';
}

export function saveNickname(nickname: string): void {
  write(local, NICKNAME_KEY, nickname);
}

let fallbackAvatar: Avatar | null = null;

export function loadAvatar(): Avatar {
  const stored = parseJson(read(local, AVATAR_KEY));
  if (isValidAvatar(stored)) return stored;
  fallbackAvatar ??= randomAvatar(Math.random);
  write(local, AVATAR_KEY, JSON.stringify(fallbackAvatar));
  return fallbackAvatar;
}

export function saveAvatar(avatar: Avatar): void {
  fallbackAvatar = avatar;
  write(local, AVATAR_KEY, JSON.stringify(avatar));
}

/** Replaces the stored avatar with a new random one. */
export function rerollAvatar(): Avatar {
  fallbackAvatar = randomAvatar(Math.random);
  write(local, AVATAR_KEY, JSON.stringify(fallbackAvatar));
  return fallbackAvatar;
}

let fallbackClientId: string | null = null;

export function loadClientId(): string {
  const stored = read(local, CLIENT_ID_KEY);
  if (stored !== null && stored.length >= 8 && stored.length <= 64) return stored;
  fallbackClientId ??= randomId(16);
  write(local, CLIENT_ID_KEY, fallbackClientId);
  return fallbackClientId;
}

/** The seat this tab holds in a room. */
export interface StoredSession {
  token: string;
  role: Role;
}

export function loadSession(roomCode: string): StoredSession | null {
  const stored = parseJson(read(session, sessionKey(roomCode)));
  if (typeof stored !== 'object' || stored === null) return null;
  const { token, role } = stored as Record<string, unknown>;
  if (typeof token !== 'string' || token.length === 0) return null;
  return { token, role: role === 'spectator' ? 'spectator' : 'player' };
}

export function saveSession(roomCode: string, value: StoredSession): void {
  write(session, sessionKey(roomCode), JSON.stringify(value));
}

export function clearSession(roomCode: string): void {
  write(session, sessionKey(roomCode), null);
}
