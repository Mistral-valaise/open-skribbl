import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.js';
import { Spinner } from './Spinner.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks further presses. */
  busy?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-sm hover:bg-accent-hover',
  secondary: 'border border-line bg-surface-raised text-fg shadow-sm hover:bg-surface-hover',
  ghost: 'text-fg-secondary hover:bg-surface-hover hover:text-fg',
  danger: 'border border-line bg-surface-raised text-danger shadow-sm hover:bg-surface-hover',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-10 px-4 pointer-coarse:min-h-11',
  lg: 'min-h-12 px-6',
};

/** The look of a button, for links that are styled as one. */
export function buttonClass(variant: Variant = 'secondary', size: Size = 'md'): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-md py-2 text-label select-none',
    'transition-colors motion-fast active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  icon,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(buttonClass(variant, size), block && 'w-full', className)}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}
