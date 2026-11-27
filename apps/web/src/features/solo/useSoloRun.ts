import type { Language } from '@kritzel/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  reduceSolo,
  startRun,
  type SoloEvent,
  type SoloRound,
  type SoloRunState,
} from './soloRun.js';

/** How often the clock is looked at: hints, time-out and the end of the reveal follow it. */
const TICK_MS = 100;

/** Runs the solo state machine on the browser's clock. */
export function useSoloRun(language: Language, rounds: readonly SoloRound[]) {
  const [run, setRun] = useState<SoloRunState>(() => startRun(language, rounds, Date.now()));
  const [now, setNow] = useState(() => Date.now());

  const dispatch = useCallback((event: SoloEvent) => {
    const at = Date.now();
    setNow(at);
    setRun((state) => reduceSolo(state, event, { now: at, random: Math.random }));
  }, []);

  const finished = run.phase === 'summary';
  useEffect(() => {
    if (finished) return;
    const timer = window.setInterval(() => dispatch({ type: 'tick' }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [finished, dispatch]);

  return { run, now, dispatch };
}
