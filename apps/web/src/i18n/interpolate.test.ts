import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate.js';

describe('interpolate', () => {
  it('fills named placeholders with strings and numbers', () => {
    expect(interpolate('{name} earned {points} points', { name: 'Mara', points: 450 })).toBe(
      'Mara earned 450 points',
    );
  });

  it('fills a placeholder every time it occurs', () => {
    expect(interpolate('{a}{a}', { a: 'x' })).toBe('xx');
  });

  it('leaves a placeholder without a value as written', () => {
    expect(interpolate('Room {code}')).toBe('Room {code}');
  });

  it('inserts values literally, without interpreting them', () => {
    expect(interpolate('{name} joined', { name: '<b>{name}</b> $&' })).toBe(
      '<b>{name}</b> $& joined',
    );
  });
});
