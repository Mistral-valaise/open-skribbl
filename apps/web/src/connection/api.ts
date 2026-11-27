/** The HTTP API (docs/ARCHITECTURE.md §4). Paths are relative: same origin only. */

export type CreateRoomResult =
  { ok: true; code: string } | { ok: false; reason: 'rate_limited' | 'server_full' | 'failed' };

export async function createRoom(): Promise<CreateRoomResult> {
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'en' }),
    });
    if (response.status === 429) return { ok: false, reason: 'rate_limited' };
    if (response.status === 503) return { ok: false, reason: 'server_full' };
    if (!response.ok) return { ok: false, reason: 'failed' };
    const body: unknown = await response.json();
    const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null;
    return typeof code === 'string' ? { ok: true, code } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export type RoomLookup = 'found' | 'missing' | 'unreachable';

export async function lookUpRoom(code: string, signal?: AbortSignal): Promise<RoomLookup> {
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, { signal });
    if (response.status === 404) return 'missing';
    return response.ok ? 'found' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
