import { DIFFICULTIES, settingsSchema } from '@kritzel/shared';

/** The part of a numeric setting's schema needed to list its values. */
interface NumberRule {
  minValue: number | null;
  maxValue: number | null;
  safeParse(value: unknown): { success: boolean };
}

/** Every value a numeric setting accepts, taken from the shared schema (spec 001, "Settings"). */
export function allowedValues(rule: NumberRule): number[] {
  const { minValue, maxValue } = rule;
  if (minValue === null || maxValue === null) return [];
  const values: number[] = [];
  for (let value = minValue; value <= maxValue; value += 1) {
    if (rule.safeParse(value).success) values.push(value);
  }
  return values;
}

const { shape } = settingsSchema;

export const SETTING_VALUES = {
  rounds: allowedValues(shape.rounds),
  drawTime: allowedValues(shape.drawTime),
  wordChoices: allowedValues(shape.wordChoices),
  hints: allowedValues(shape.hints),
  maxPlayers: allowedValues(shape.maxPlayers),
  difficulty: DIFFICULTIES,
} as const;
