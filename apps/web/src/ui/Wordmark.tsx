import { t } from '../i18n/index.js';
import { cx } from './cx.js';

interface WordmarkProps {
  size?: 'sm' | 'lg';
  className?: string;
}

/** "Kritzel" in the display typeface with the hand-drawn squiggle underline (DESIGN §2). */
export function Wordmark({ size = 'lg', className }: WordmarkProps) {
  return (
    <span
      className={cx(
        'relative inline-block font-display font-bold tracking-tight text-fg',
        size === 'lg' ? 'pb-3 text-display' : 'pb-1.5 text-heading font-bold',
        className,
      )}
    >
      {t('app.name')}
      <svg
        aria-hidden
        viewBox="0 0 120 12"
        preserveAspectRatio="none"
        className={cx(
          'absolute inset-x-0 bottom-0 w-full text-accent',
          size === 'lg' ? 'h-3' : 'h-2',
        )}
        fill="none"
      >
        <path
          d="M3 7c7-6 12-6 17 0s11 6 17 0 11-6 17 0 11 6 17 0 11-6 17 0 12 5 29-2"
          stroke="currentColor"
          strokeWidth={size === 'lg' ? 3 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
