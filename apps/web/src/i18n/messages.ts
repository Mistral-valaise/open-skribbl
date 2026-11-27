import type { en } from './en.js';

/** `en.ts` defines the keys of every dictionary. */
export type MessageKey = keyof typeof en;

/**
 * The shape every language's dictionary has to satisfy: a dictionary declared
 * as `Messages` fails the type check when a key is missing or unknown (spec 006).
 */
export type Messages = Readonly<Record<MessageKey, string>>;
