import { describe, expect, it } from 'vitest';
import { SETTING_VALUES } from './settingValues.js';

describe('SETTING_VALUES', () => {
  it('AC-001-08: the settings form offers exactly the values the rules accept', () => {
    expect(SETTING_VALUES.rounds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(SETTING_VALUES.drawTime).toEqual([
      30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180,
    ]);
    expect(SETTING_VALUES.wordChoices).toEqual([2, 3, 4, 5]);
    expect(SETTING_VALUES.hints).toEqual([0, 1, 2, 3, 4, 5]);
    expect(SETTING_VALUES.maxPlayers).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(SETTING_VALUES.difficulty).toEqual(['easy', 'medium', 'hard', 'mixed']);
  });
});
