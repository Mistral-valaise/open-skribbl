/** The invite link of a room: `<origin>/r/<CODE>` (spec 001). */
export function inviteLink(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}
