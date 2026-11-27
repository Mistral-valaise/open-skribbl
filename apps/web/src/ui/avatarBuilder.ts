import { AVATAR_PARTS, randomAvatar, type Avatar } from '@kritzel/shared';

/** The four parts of an avatar, in the order the builder shows them (spec 010). */
export const AVATAR_PART_NAMES = ['body', 'eyes', 'mouth', 'accessory'] as const;
export type AvatarPart = (typeof AVATAR_PART_NAMES)[number];

/** `<body>-<eyes>-<mouth>-<accessory>`: identifies an avatar in markup and tests. */
export function avatarKey(avatar: Avatar): string {
  return AVATAR_PART_NAMES.map((part) => avatar[part]).join('-');
}

/** The previous (-1) or next (+1) choice of one part, wrapping at the ends of its range. */
export function stepAvatarPart(avatar: Avatar, part: AvatarPart, step: -1 | 1): Avatar {
  const count = AVATAR_PARTS[part];
  return { ...avatar, [part]: (avatar[part] + step + count) % count };
}

/** A random avatar that is not the current one: the dice always changes something. */
export function differentRandomAvatar(current: Avatar, random: () => number): Avatar {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomAvatar(random);
    if (avatarKey(candidate) !== avatarKey(current)) return candidate;
  }
  // The random source keeps producing the same avatar: move on by one body colour.
  return stepAvatarPart(current, 'body', 1);
}
