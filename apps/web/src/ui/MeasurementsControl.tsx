import { Gauge } from 'lucide-react';
import { useId, useRef } from 'react';
import { t } from '../i18n/index.js';
import { setMeasurementsOn, useMeasurementsStore } from '../telemetry/index.js';
import { Button } from './Button.js';
import { cx } from './cx.js';
import { IconButton, ICON } from './IconButton.js';

/**
 * Browser measurements (spec 015): a shell control that opens a dialog with
 * what is shared and the player's switch. Rendered only when the server
 * offers them; the switch is off until the player turns it on.
 */
export function MeasurementsControl() {
  const offered = useMeasurementsStore((state) => state.offered);
  const on = useMeasurementsStore((state) => state.on);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const explanationId = useId();
  if (!offered) return null;

  return (
    <>
      <IconButton
        data-testid="rum-toggle"
        label={t('measurements.title')}
        icon={<Gauge {...ICON} />}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      />
      {/* A modal `<dialog>` traps focus, closes on Escape and returns focus to the control. */}
      <dialog
        ref={dialog}
        data-testid="rum-dialog"
        aria-labelledby={titleId}
        // A press on the backdrop lands on the dialog itself, not on its content.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className={cx(
          'm-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line bg-surface-overlay text-fg shadow-lg',
          'backdrop:bg-scrim open:animate-overlay',
          // A bottom sheet on phones (DESIGN §8, "Modal").
          'max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none',
        )}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <h2 id={titleId} className="text-subheading text-fg">
            {t('measurements.title')}
          </h2>
          <p
            id={explanationId}
            data-testid="rum-explanation"
            className="text-label text-fg-secondary"
          >
            {t('measurements.explanation')}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-describedby={explanationId}
            data-testid="rum-switch"
            onClick={() => setMeasurementsOn(!on)}
            className="flex min-h-11 items-center justify-between gap-4 rounded-md text-left text-label text-fg"
          >
            {t('measurements.switch')}
            {/* The thumb's side shows the state; the colour only repeats it. */}
            <span
              aria-hidden
              className={cx(
                'flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors motion-fast',
                on ? 'justify-end border-accent bg-accent' : 'border-line bg-surface-hover',
              )}
            >
              <span
                className={cx('size-4.5 rounded-full', on ? 'bg-on-accent' : 'bg-fg-secondary')}
              />
            </span>
          </button>
          <Button data-testid="rum-close" onClick={() => dialog.current?.close()}>
            {t('measurements.close')}
          </Button>
        </div>
      </dialog>
    </>
  );
}
