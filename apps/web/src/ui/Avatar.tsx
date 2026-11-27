import { AVATAR_PARTS, type Avatar as AvatarParts } from '@kritzel/shared';
import type { ReactNode } from 'react';
import { t } from '../i18n/index.js';
import { avatarKey } from './avatarBuilder.js';
import { cx } from './cx.js';

/**
 * A participant's avatar (spec 010): a circle in one of twelve body colours
 * with eyes, a mouth and an optional accessory. The parts are drawn for this
 * project in a 64 × 64 box with bold shapes, so they still read at 28 px, and
 * use the same ink on every body colour, so they work in both themes.
 */

const INK = 'var(--avatar-ink)';
const WHITE = 'var(--avatar-white)';
const line = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' } as const;

/** Eyes sit around y = 27. */
const EYES: readonly ReactNode[] = [
  <>
    <circle cx="23" cy="27" r="3.5" fill={INK} />
    <circle cx="41" cy="27" r="3.5" fill={INK} />
  </>,
  <>
    <circle cx="22" cy="27" r="5" fill={INK} />
    <circle cx="42" cy="27" r="5" fill={INK} />
    <circle cx="23.5" cy="25.5" r="1.5" fill={WHITE} />
    <circle cx="43.5" cy="25.5" r="1.5" fill={WHITE} />
  </>,
  <>
    <ellipse cx="23" cy="27" rx="3" ry="5.5" fill={INK} />
    <ellipse cx="41" cy="27" rx="3" ry="5.5" fill={INK} />
  </>,
  <>
    <path d="M18 29q5-7 10 0" {...line} />
    <path d="M36 29q5-7 10 0" {...line} />
  </>,
  <>
    <path d="M18 27h10" {...line} />
    <path d="M36 27h10" {...line} />
  </>,
  <>
    <circle cx="23" cy="27" r="3.5" fill={INK} />
    <path d="M36 28q5-6 10 0" {...line} />
  </>,
  <>
    <circle cx="23" cy="29" r="3.5" fill={INK} />
    <circle cx="41" cy="29" r="3.5" fill={INK} />
    <path d="M17 21l10 2" {...line} />
    <path d="M47 21l-10 2" {...line} />
  </>,
  <>
    <circle cx="22" cy="27" r="6.5" fill={WHITE} stroke={INK} strokeWidth="2" />
    <circle cx="42" cy="27" r="6.5" fill={WHITE} stroke={INK} strokeWidth="2" />
    <circle cx="23.5" cy="28" r="3" fill={INK} />
    <circle cx="40.5" cy="28" r="3" fill={INK} />
  </>,
];

/** Mouths sit around y = 45. */
const MOUTHS: readonly ReactNode[] = [
  <path d="M23 42q9 9 18 0" {...line} />,
  <path d="M22 41h20q-2 11-10 11t-10-11z" fill={INK} />,
  <path d="M25 45h14" {...line} />,
  <circle cx="32" cy="46" r="4" fill={INK} />,
  <path d="M25 45q9 5 16-3" {...line} />,
  <path d="M22 45q3-4 6 0t7 0 7 0" {...line} />,
  <path d="M24 48q8-7 16 0" {...line} />,
  <>
    <path d="M22 41h20q-2 11-10 11t-10-11z" fill={INK} />
    <path d="M26 41h12v3.5h-12z" fill={WHITE} />
  </>,
];

/** Accessories; index 0 is none. Anything outside the circle is clipped away. */
const ACCESSORIES: readonly ReactNode[] = [
  null,
  // Beanie
  <>
    <path d="M0 0h64v17q-32 9-64 0z" fill={INK} />
    <path d="M3 13q29 8 58 0" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" fill="none" />
  </>,
  // Bow tie
  <>
    <path d="M32 59l-9-5v10zM32 59l9-5v10z" fill={INK} />
    <circle cx="32" cy="59" r="2.2" fill={WHITE} />
  </>,
  // Glasses
  <>
    <rect x="13" y="19" width="17" height="16" rx="6" fill={WHITE} fillOpacity="0.35" />
    <rect x="34" y="19" width="17" height="16" rx="6" fill={WHITE} fillOpacity="0.35" />
    <rect x="13" y="19" width="17" height="16" rx="6" stroke={INK} strokeWidth="2.5" fill="none" />
    <rect x="34" y="19" width="17" height="16" rx="6" stroke={INK} strokeWidth="2.5" fill="none" />
    <path d="M30 26h4M13 25l-7-2M51 25l7-2" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
  </>,
  // Headphones
  <>
    <path d="M7 30q0-25 25-25t25 25" stroke={INK} strokeWidth="4" fill="none" />
    <rect x="0" y="24" width="9" height="18" rx="4" fill={INK} />
    <rect x="55" y="24" width="9" height="18" rx="4" fill={INK} />
  </>,
  // Headband
  <>
    <path d="M3 18q29-9 58 0" stroke={INK} strokeWidth="9" fill="none" />
    <path d="M3 18q29-9 58 0" stroke={WHITE} strokeWidth="5.5" fill="none" />
  </>,
  // Moustache
  <path
    d="M32 37c-3-4-10-4-14 2 5 2 11 1 14-2 3 3 9 4 14 2-4-6-11-6-14-2z"
    fill={INK}
    stroke={INK}
    strokeWidth="1.5"
    strokeLinejoin="round"
  />,
  // Star
  <path
    d="M49 6L51.1 11.1L56.6 11.5L52.4 15.1L53.7 20.5L49 17.6L44.3 20.5L45.6 15.1L41.4 11.5L46.9 11.1Z"
    fill={WHITE}
    stroke={INK}
    strokeWidth="2"
    strokeLinejoin="round"
  />,
];

/** A value outside its range (it cannot come from the server) is folded back into it. */
const within = (value: number, count: number) => ((Math.trunc(value) % count) + count) % count;

interface AvatarProps {
  avatar: AvatarParts;
  /** The participant's nickname, for the alternative text. */
  name: string;
  /** Edge length in CSS pixels; the design sizes are 28, 40, 64 and 120. */
  size?: number;
  className?: string;
}

export function Avatar({ avatar, name, size = 40, className }: AvatarProps) {
  const parts: AvatarParts = {
    body: within(avatar.body, AVATAR_PARTS.body),
    eyes: within(avatar.eyes, AVATAR_PARTS.eyes),
    mouth: within(avatar.mouth, AVATAR_PARTS.mouth),
    accessory: within(avatar.accessory, AVATAR_PARTS.accessory),
  };
  return (
    <span
      data-testid="avatar"
      data-avatar={avatarKey(parts)}
      role="img"
      aria-label={t('identity.avatarAlt', { name })}
      className={cx('inline-block shrink-0 overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className="block">
        <rect width="64" height="64" fill={`var(--avatar-body-${parts.body})`} />
        {EYES[parts.eyes]}
        {MOUTHS[parts.mouth]}
        {ACCESSORIES[parts.accessory]}
      </svg>
    </span>
  );
}
