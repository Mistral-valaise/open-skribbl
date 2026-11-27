import { letterCounts, MASK_BLANK } from '@kritzel/shared';
import { t } from '../i18n/index.js';
import { cx } from './cx.js';

interface WordMaskProps {
  /** The word as guessers see it: blanks for hidden letters, revealed letters shown. */
  mask: string;
  className?: string;
}

/**
 * The mask in mono with wide letter spacing and the letter count of each
 * written word (DESIGN §4 and §8). A revealed letter pops in.
 */
export function WordMask({ mask, className }: WordMaskProps) {
  const counts = letterCounts(mask).join(' + ');
  return (
    <span className={cx('inline-flex max-w-full items-center gap-2', className)}>
      <span
        data-testid="word-mask"
        data-mask={mask}
        aria-label={t('game.letterCount', { counts })}
        className="font-mono text-subheading font-semibold whitespace-pre-wrap text-fg sm:text-heading"
      >
        {Array.from(mask, (char, index) =>
          char === ' ' ? (
            <span key={index} className="inline-block w-[0.9em]">
              {' '}
            </span>
          ) : (
            <span
              // A revealed letter is a new element, so its entrance animation runs.
              key={`${index}${char}`}
              className={cx(
                'mx-[0.15em] inline-block',
                char === MASK_BLANK ? 'text-fg-muted' : 'animate-pop',
              )}
            >
              {char}
            </span>
          ),
        )}
      </span>
      <span
        aria-hidden
        data-testid="letter-counts"
        className="rounded-full border border-line px-2 py-0.5 font-mono text-caption text-fg-secondary"
      >
        {counts}
      </span>
    </span>
  );
}
