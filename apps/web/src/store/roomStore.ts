import { create } from 'zustand';
import { INITIAL_ROOM_DATA, type RoomData } from './roomReducer.js';

/** The client's picture of the room it is in; written by `session.ts` only. */
export const useRoomStore = create<RoomData>(() => INITIAL_ROOM_DATA);
