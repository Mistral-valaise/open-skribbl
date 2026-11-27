import type { Language } from '@kritzel/shared';
import { de } from './de.js';
import { en } from './en.js';
import { es } from './es.js';
import { fr } from './fr.js';
import type { Messages } from './messages.js';

/** One dictionary per interface language (spec 006). */
export const DICTIONARIES: Readonly<Record<Language, Messages>> = { en, de, es, fr };
