import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type Language } from '@kritzel/shared';
import { Room, type RoomDeps } from './room.js';

export class ServerFullError extends Error {}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

/** All live rooms of this process. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly deps: Omit<RoomDeps, 'onDispose'> & {
      onRoomDisposed?: (code: string, rooms: number) => void;
    },
    private readonly maxRooms: number,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(language: Language): Room {
    if (this.rooms.size >= this.maxRooms) throw new ServerFullError();
    let code: string;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[Math.floor(this.deps.random() * ROOM_CODE_ALPHABET.length)],
      ).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, language, {
      ...this.deps,
      onDispose: (disposed) => {
        this.rooms.delete(disposed);
        this.deps.onRoomDisposed?.(disposed, this.rooms.size);
      },
    });
    this.rooms.set(code, room);
    return room;
  }

  /** Connected participants across all rooms, by role (spec 015 gauges). */
  connected(): { players: number; spectators: number } {
    const counts = { players: 0, spectators: 0 };
    for (const room of this.rooms.values()) {
      for (const seat of room.state.seats) {
        if (seat.connId === null) continue;
        if (seat.role === 'player') counts.players += 1;
        else counts.spectators += 1;
      }
    }
    return counts;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  shutdown(): void {
    for (const room of [...this.rooms.values()]) room.shutdown();
  }
}
