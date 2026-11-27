import { useEffect, useState } from 'react';
import { remainingMs } from '../../connection/clock.js';
import { useRoomStore } from '../../store/roomStore.js';

const TICK_MS = 200;

/** Milliseconds left in the current phase on the server's clock, ticking locally. */
export function useRemaining(): number {
  const phaseEndsAt = useRoomStore((state) => state.view?.phaseEndsAt ?? null);
  const clockOffset = useRoomStore((state) => state.clockOffset);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phaseEndsAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [phaseEndsAt, clockOffset]);

  return remainingMs(phaseEndsAt, clockOffset, now);
}
