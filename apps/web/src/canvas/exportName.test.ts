import { describe, expect, it } from 'vitest';
import { exportFileName } from './exportName.js';

describe('exportFileName', () => {
  it('AC-008-12: "Ice cream" by "Mara K." is named kritzel-ice-cream-mara-k-.png', () => {
    expect(exportFileName('Ice cream', 'Mara K.')).toBe('kritzel-ice-cream-mara-k-.png');
  });

  it('AC-008-12: letters of any script, digits and hyphens are kept and lower-cased', () => {
    expect(exportFileName('T-Shirt', 'José_99')).toBe('kritzel-t-shirt-josé-99.png');
    expect(exportFileName('Straße', 'ÖZGE')).toBe('kritzel-straße-özge.png');
  });

  it('AC-008-12: characters that are unsafe in file names never reach the name', () => {
    const name = exportFileName("rock 'n' roll", '../Mara\\x');
    expect(name).toBe('kritzel-rock--n--roll----mara-x.png');
    expect(name).toMatch(/^[\p{L}\p{N}-]+\.png$/u);
  });
});
