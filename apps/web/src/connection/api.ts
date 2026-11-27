import type { ClientConfig, Language } from '@kritzel/shared';

/** The HTTP API (docs/ARCHITECTURE.md §4). Paths are relative: same origin only. */

export type CreateRoomResult =
  { ok: true; code: string } | { ok: false; reason: 'rate_limited' | 'server_full' | 'failed' };

/** The host's interface language becomes the room's word language (spec 001, "Settings"). */
export async function createRoom(language: Language): Promise<CreateRoomResult> {
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language }),
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

/** What the server offers this client (spec 015); anything but a clear yes means no. */
export async function fetchClientConfig(): Promise<ClientConfig> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) return { rum: false };
    const body: unknown = await response.json();
    return { rum: typeof body === 'object' && body !== null && 'rum' in body && body.rum === true };
  } catch {
    return { rum: false };
  }
}

/**
 * Posts one report of browser measurements (spec 015). `keepalive` lets it
 * finish while the page is being hidden or closed. A report that fails is lost.
 */
export function postMeasurements(body: string): void {
  try {
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // No `fetch`, or it refused the request: nothing is sent.
  }
}
