import { TIMING } from '@kritzel/shared';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';
import { useRemaining } from './useRemaining.js';

/** The drawer's word choices: large buttons and a countdown bar (DESIGN §9). */
export function WordChoiceOverlay({ words }: { words: readonly string[] }) {
  const remaining = useRemaining();
  const share = Math.min(1, remaining / TIMING.choosingMs);

  return (
    <div className="absolute inset-0 grid animate-fade-in place-items-center overflow-y-auto bg-scrim p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={t('game.chooseWord')}
        className="flex w-full max-w-lg animate-overlay flex-col gap-3 rounded-xl border border-line bg-surface-raised p-4 shadow-lg sm:gap-4 sm:p-6"
      >
        <div className="flex flex-col gap-0.5 text-center">
          <h2 className="font-display text-subheading text-fg sm:text-heading">
            {t('game.chooseWord')}
          </h2>
          <p className="hidden text-label font-normal text-fg-secondary sm:block">
            {t('game.chooseHint')}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {words.map((word, index) => (
            <button
              key={word}
              type="button"
              data-testid="word-choice"
              onClick={() => send({ type: 'word.choose', index })}
              className="min-h-11 flex-1 basis-32 rounded-md border border-line bg-surface-overlay px-4 py-2 text-body font-semibold text-fg transition-colors motion-fast hover:border-accent hover:bg-accent hover:text-on-accent sm:min-h-14 sm:text-subheading"
            >
              {word}
            </button>
          ))}
        </div>
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
