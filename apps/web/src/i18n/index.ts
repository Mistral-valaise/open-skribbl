import type { Difficulty, ErrorCode, SystemMessageKey, TurnEndReason } from '@kritzel/shared';
import { en } from './en.js';
import { interpolate, type MessageParams } from './interpolate.js';

export type MessageKey = keyof typeof en;
/** The shape every language's dictionary has to satisfy. */
export type Messages = Readonly<Record<MessageKey, string>>;

/** Compile-time proof that a family of keys built from protocol values is complete. */
type Defined<Key extends MessageKey> = Key;
export type ErrorMessageKey = Defined<`error.${ErrorCode}`>;
export type SystemMessageTextKey = Defined<`system.${SystemMessageKey}`>;
export type TurnEndReasonKey = Defined<`turnEnd.reason.${TurnEndReason}`>;
export type DifficultyKey = Defined<`difficulty.${Difficulty}`>;

/** M1 ships English only; the language switch arrives with spec 011. */
const messages: Messages = en;

export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(messages[key], params);
}

export type { MessageParams };
