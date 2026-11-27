import { describe, expect, it } from 'vitest';
import { inviteLink } from './inviteLink.js';

describe('inviteLink', () => {
  it('AC-001-15: the invite link is <origin>/r/<CODE>', () => {
    expect(inviteLink('https://play.example.org', 'ABC234')).toBe(
      'https://play.example.org/r/ABC234',
    );
  });
});
