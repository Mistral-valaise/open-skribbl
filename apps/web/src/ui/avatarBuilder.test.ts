import {
  AVATAR_PARTS,
  isValidAvatar,
  randomAvatar,
  type Avatar as AvatarParts,
} from '@kritzel/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar.js';
import {
  AVATAR_PART_NAMES,
  avatarKey,
  differentRandomAvatar,
  stepAvatarPart,
} from './avatarBuilder.js';

/** A deterministic random source for the tests. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('avatar builder', () => {
  it('AC-010-05: a random avatar is valid, and the dice gives a different valid one', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = sequence(seed);
      const first = randomAvatar(random);
      expect(isValidAvatar(first)).toBe(true);
      const rolled = differentRandomAvatar(first, random);
      expect(isValidAvatar(rolled)).toBe(true);
      expect(avatarKey(rolled)).not.toBe(avatarKey(first));
    }
  });

  it('AC-010-05: the dice changes the avatar even when the random source repeats itself', () => {
    const stuck = () => 0.5;
    const current = randomAvatar(stuck);
    const rolled = differentRandomAvatar(current, stuck);
    expect(isValidAvatar(rolled)).toBe(true);
    expect(avatarKey(rolled)).not.toBe(avatarKey(current));
  });

  it('AC-010-06: each previous/next control changes exactly one part', () => {
    const start: AvatarParts = { body: 3, eyes: 4, mouth: 5, accessory: 2 };
    for (const part of AVATAR_PART_NAMES) {
      for (const step of [-1, 1] as const) {
        const changed = stepAvatarPart(start, part, step);
        expect(changed[part]).toBe(start[part] + step);
        for (const other of AVATAR_PART_NAMES.filter((name) => name !== part)) {
          expect(changed[other]).toBe(start[other]);
        }
        expect(start).toEqual({ body: 3, eyes: 4, mouth: 5, accessory: 2 });
      }
    }
  });

  it('AC-010-06: the controls wrap around at both ends of each range', () => {
    const first: AvatarParts = { body: 0, eyes: 0, mouth: 0, accessory: 0 };
    for (const part of AVATAR_PART_NAMES) {
      const last = stepAvatarPart(first, part, -1);
      expect(last[part]).toBe(AVATAR_PARTS[part] - 1);
      expect(isValidAvatar(last)).toBe(true);
      expect(stepAvatarPart(last, part, 1)).toEqual(first);
    }
  });

  it('AC-010-06: stepping through a whole range visits every choice once', () => {
    for (const part of AVATAR_PART_NAMES) {
      let avatar: AvatarParts = { body: 0, eyes: 0, mouth: 0, accessory: 0 };
      const seen = new Set<number>();
      for (let step = 0; step < AVATAR_PARTS[part]; step += 1) {
        seen.add(avatar[part]);
        avatar = stepAvatarPart(avatar, part, 1);
      }
      expect(seen.size).toBe(AVATAR_PARTS[part]);
      expect(avatar[part]).toBe(0);
    }
  });

  it('AC-010-09: every one of the 12 × 8 × 8 × 8 combinations renders without error', () => {
    const markups = new Set<string>();
    let rendered = 0;
    for (let body = 0; body < AVATAR_PARTS.body; body += 1) {
      for (let eyes = 0; eyes < AVATAR_PARTS.eyes; eyes += 1) {
        for (let mouth = 0; mouth < AVATAR_PARTS.mouth; mouth += 1) {
          for (let accessory = 0; accessory < AVATAR_PARTS.accessory; accessory += 1) {
            const avatar = { body, eyes, mouth, accessory };
            const markup = renderToStaticMarkup(createElement(Avatar, { avatar, name: 'Mara' }));
            expect(markup).toContain(`data-avatar="${body}-${eyes}-${mouth}-${accessory}"`);
            expect(markup).toContain(`--avatar-body-${body}`);
            markups.add(markup);
            rendered += 1;
          }
        }
      }
    }
    expect(rendered).toBe(12 * 8 * 8 * 8);
    // Every combination looks different from every other one.
    expect(markups.size).toBe(rendered);
  });

  it('AC-010-10: the avatar has the alternative text "Avatar of <nickname>"', () => {
    const markup = renderToStaticMarkup(
      createElement(Avatar, { avatar: { body: 1, eyes: 2, mouth: 3, accessory: 4 }, name: 'Mara' }),
    );
    expect(markup).toContain('aria-label="Avatar of Mara"');
  });
});
