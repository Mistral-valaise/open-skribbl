import { t } from '../i18n/index.js';

/** Who made Kritzel, and where to find them (spec 011, "Credit"). */
export const AUTHOR = { name: 'Mistral N', url: 'https://mistraln.de/' } as const;

/**
 * "Created by Mistral N", the name linking to the author's site. Plain
 * navigation in a new tab without a referrer; nothing is loaded from there.
 */
export function CreatedBy() {
  // The sentence is translated as a whole; the name is the part that links.
  const [before, after] = t('app.createdBy', { name: '\u0000' }).split('\u0000');
  return (
    <span data-testid="created-by">
      {before}
      <a
        data-testid="author-link"
        href={AUTHOR.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-sm text-fg-secondary underline underline-offset-2 hover:text-fg"
      >
        {AUTHOR.name}
      </a>
      {after}
    </span>
  );
}
