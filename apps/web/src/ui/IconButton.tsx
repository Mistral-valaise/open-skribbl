import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.js';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** The accessible name, also shown as the tooltip. */
  label: string;
  icon: ReactNode;
  /** Marks a toggle as on: ring, tinted surface and `aria-pressed`. */
  pressed?: boolean;
  tone?: 'default' | 'danger';
}

/** A square button with only an icon (DESIGN §8). */
export function IconButton({
  label,
  icon,
  pressed,
  tone = 'default',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-md select-none',
        'pointer-coarse:size-11',
        'transition-colors motion-fast disabled:pointer-events-none disabled:opacity-40',
        pressed
          ? 'bg-accent/15 text-accent-fg ring-2 ring-accent ring-inset'
          : tone === 'danger'
            ? 'text-fg-secondary hover:bg-surface-hover hover:text-danger'
            : 'text-fg-secondary hover:bg-surface-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

/** The icon size and stroke used inside controls (DESIGN §8). */
export const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;
