import { t } from '../../i18n/index.js';
import { cx } from '../../ui/cx.js';

const NOTICE_URL = 'https://github.com/mistral-valaise/open-skribbl/blob/main/NOTICE.md';

/** The dataset credit with a link to the notice (spec 009, "Attribution"). */
export function SoloCredit({ className }: { className?: string }) {
  return (
    <p className={cx('text-caption text-fg-muted', className)}>
      {t('solo.credit')}{' '}
      <a
        data-testid="solo-credit"
        href={NOTICE_URL}
        target="_blank"
        rel="noreferrer"
        className="rounded-sm text-fg-secondary underline underline-offset-2 hover:text-fg"
      >
        {t('solo.creditLink')}
      </a>
    </p>
  );
}
