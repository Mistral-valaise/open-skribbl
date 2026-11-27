import type { Avatar as AvatarParts } from '@kritzel/shared';
import type { ReactNode } from 'react';
import { t } from '../i18n/index.js';
import { cx } from './cx.js';

/**
 * A participant's avatar: a circle in one of twelve body colours with simple
 * eyes and a mouth. The full builder with accessories arrives with spec 010;
 * this component is the one place to replace then.
 */

const INK = 'var(--avatar-ink)';
const line = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' } as const;

/** Eyes sit around y = 27 of the 64 × 64 box. */
const EYES: readonly ReactNode[] = [
  <>
    <circle cx="23" cy="27" r="3.5" fill={INK} />
    <circle cx="41" cy="27" r="3.5" fill={INK} />
  </>,
  <>
    <circle cx="22" cy="27" r="5" fill={INK} />
    <circle cx="42" cy="27" r="5" fill={INK} />
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
    <circle cx="23" cy="27" r="6" {...line} />
    <circle cx="41" cy="27" r="6" {...line} />
    <path d="M29 27h6" {...line} />
    <circle cx="23" cy="27" r="2" fill={INK} />
    <circle cx="41" cy="27" r="2" fill={INK} />
  </>,
];

/** Mouths sit around y = 43. */
const MOUTHS: readonly ReactNode[] = [
  <path d="M23 41q9 9 18 0" {...line} />,
  <path d="M22 40h20q-2 11-10 11t-10-11z" fill={INK} />,
  <path d="M25 44h14" {...line} />,
  <circle cx="32" cy="44" r="4" fill={INK} />,
  <path d="M25 44q9 5 16-3" {...line} />,
  <path d="M22 44q3-4 6 0t7 0 7 0" {...line} />,
  <path d="M24 46q8-7 16 0" {...line} />,
  <>
    <path d="M22 40h20q-2 10-10 10t-10-10z" fill={INK} />
    <path d="M27 40h10v3h-10z" fill="var(--paper)" />
  </>,
];

type AvatarSize = 28 | 40 | 64 | 120;

interface AvatarProps {
  avatar: AvatarParts;
  /** The participant's nickname, for the alternative text. */
  name: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ avatar, name, size = 40, className }: AvatarProps) {
  const body = ((avatar.body % 12) + 12) % 12;
  return (
    <svg
      role="img"
      aria-label={t('identity.avatarAlt', { name })}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cx('shrink-0 rounded-full', className)}
    >
      <circle cx="32" cy="32" r="32" fill={`var(--avatar-body-${body})`} />
      {EYES[avatar.eyes % EYES.length]}
      {MOUTHS[avatar.mouth % MOUTHS.length]}
    </svg>
  );
}
