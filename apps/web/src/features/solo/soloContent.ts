import { LANGUAGES, type SoloDrawing } from '@kritzel/shared';
import type { SoloCategory } from './soloRun.js';

/**
 * The bundled solo dataset, served by the app itself under `/content/solo/`
 * (spec 009, "Content"). These GET requests are the only ones solo mode makes.
 */
const CONTENT_PATH = '/content/solo';

const isLabel = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** Keeps the entries of `categories.json` that have the expected shape. */
export function parseCategories(json: unknown): SoloCategory[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const { id, file } = record;
    if (typeof id !== 'string' || typeof file !== 'string' || !/^[\w-]+$/.test(file)) return [];
    if (!LANGUAGES.every((language) => isLabel(record[language] ?? null))) return [];
    const labels = Object.fromEntries(
      LANGUAGES.map((language) => [language, (record[language] as string | null) ?? null]),
    ) as Record<(typeof LANGUAGES)[number], string | null>;
    return [{ id, file, ...labels }];
  });
}

const isStroke = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  value.length % 2 === 0 &&
  value.every((point) => typeof point === 'number' && Number.isFinite(point));

/** Keeps the drawings of a drawings file that are lists of flat point lists. */
export function parseDrawings(json: unknown): SoloDrawing[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (drawing: unknown): drawing is number[][] =>
      Array.isArray(drawing) && drawing.length > 0 && drawing.every(isStroke),
  );
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${CONTENT_PATH}/${path}`);
  if (!response.ok) throw new Error(`solo content ${path}: ${response.status}`);
  return (await response.json()) as unknown;
}

let categories: Promise<SoloCategory[]> | null = null;

/** The category list, fetched once per visit; a failed attempt is retried on the next call. */
export function loadCategories(): Promise<SoloCategory[]> {
  categories ??= getJson('categories.json')
    .then((json) => {
      const parsed = parseCategories(json);
      if (parsed.length === 0) throw new Error('solo content: no categories');
      return parsed;
    })
    .catch((error: unknown) => {
      categories = null;
      throw error;
    });
  return categories;
}

export async function loadDrawings(file: string): Promise<SoloDrawing[]> {
  const drawings = parseDrawings(await getJson(`drawings/${file}.json`));
  if (drawings.length === 0) throw new Error(`solo content: no drawings in ${file}`);
  return drawings;
}
