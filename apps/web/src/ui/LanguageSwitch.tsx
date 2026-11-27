import { LANGUAGES } from '@kritzel/shared';
import { setLanguage, t, useLanguageStore } from '../i18n/index.js';
import { cx } from './cx.js';

/**
 * The interface language switch, present on every screen (spec 006): a
 * segmented control with one button per language.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const active = useLanguageStore((state) => state.language);
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cx(
        'inline-flex shrink-0 rounded-md border border-line bg-surface-raised p-0.5',
        className,
      )}
    >
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          data-testid={`language-${language}`}
          lang={language}
          aria-label={t(`language.${language}`)}
          title={t(`language.${language}`)}
          aria-pressed={language === active}
          onClick={() => setLanguage(language)}
          className={cx(
            'min-h-8 min-w-9 rounded-sm px-2 text-caption uppercase transition-colors motion-fast',
            language === active
              ? 'bg-accent text-on-accent'
              : 'text-fg-secondary hover:bg-surface-hover hover:text-fg',
          )}
        >
          {language}
        </button>
      ))}
    </div>
  );
}
