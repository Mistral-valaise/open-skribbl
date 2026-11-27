import { LANGUAGES, type Language, SOLO } from '@kritzel/shared';

/**
 * Personal bests of solo mode (spec 009): per language the best total and the
 * latest run totals with their dates. Kept in the browser only.
 */

/** How many recent runs are kept per language (spec 009, "Personal best"). */
export const RECENT_RUNS = SOLO.recentRuns;
export const SOLO_BEST_STORAGE_KEY = 'kritzel.soloBest';

export interface SoloRunRecord {
  total: number;
  /** ISO 8601 date and time of the end of the run. */
  date: string;
}

export interface SoloRecord {
  best: number;
  /** Latest first. */
  recent: readonly SoloRunRecord[];
}

export type SoloBests = Readonly<Partial<Record<Language, SoloRecord>>>;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Reads what was stored, dropping anything that does not have the expected shape. */
export function parseBests(text: string | null): SoloBests {
  if (text === null) return {};
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof stored !== 'object' || stored === null) return {};
  const bests: Partial<Record<Language, SoloRecord>> = {};
  for (const language of LANGUAGES) {
    const record = (stored as Record<string, unknown>)[language];
    if (typeof record !== 'object' || record === null) continue;
    const { best, recent } = record as Record<string, unknown>;
    if (!isCount(best)) continue;
    const runs = (Array.isArray(recent) ? recent : []).flatMap((run: unknown) => {
      if (typeof run !== 'object' || run === null) return [];
      const { total, date } = run as Record<string, unknown>;
      return isCount(total) && typeof date === 'string' ? [{ total, date }] : [];
    });
    bests[language] = { best, recent: runs.slice(0, RECENT_RUNS) };
  }
  return bests;
}

export interface RecordedRun {
  bests: SoloBests;
  /** Whether this run beat the stored best of its language. */
  isNewBest: boolean;
}

/** Adds a finished run: the latest five totals are kept, a higher total becomes the best. */
export function recordRun(
  bests: SoloBests,
  language: Language,
  total: number,
  date: string,
): RecordedRun {
  const previous = bests[language];
  const isNewBest = total > (previous?.best ?? 0);
  return {
    isNewBest,
    bests: {
      ...bests,
      [language]: {
        best: Math.max(total, previous?.best ?? 0),
        recent: [{ total, date }, ...(previous?.recent ?? [])].slice(0, RECENT_RUNS),
      },
    },
  };
}

type BestStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadBests(storage: BestStorage): SoloBests {
  try {
    return parseBests(storage.getItem(SOLO_BEST_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveBests(storage: BestStorage, bests: SoloBests): void {
  try {
    storage.setItem(SOLO_BEST_STORAGE_KEY, JSON.stringify(bests));
  } catch {
    // Without storage the best lasts for this visit only.
  }
}
