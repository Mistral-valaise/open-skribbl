import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@kritzel/shared';

/** Room codes are case-insensitive and ignore surrounding whitespace (spec 001). */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Whether the text can be a room code at all; the server decides whether the room exists. */
export function isRoomCodeShaped(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH &&
    Array.from(code).every((char) => ROOM_CODE_ALPHABET.includes(char))
  );
}
