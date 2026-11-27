import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cx } from './cx.js';

const CONTROL =
  'min-h-11 rounded-sm border bg-surface-overlay px-3 text-body text-fg ' +
  'transition-colors motion-fast disabled:opacity-60';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown below the field and announced; also marks the field as invalid. */
  error?: string | null;
  /** Keeps the label for assistive technology only. */
  hideLabel?: boolean;
  inputClassName?: string;
}

/** A text input with its label above and its error below (DESIGN §8). */
export function TextField({
  label,
  error,
  hideLabel = false,
  className,
  inputClassName,
  id,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-label text-fg-secondary'}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          CONTROL,
          'w-full',
          error ? 'border-danger' : 'border-line hover:border-fg-muted',
          inputClassName,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

/** A native select in a row: label on the left, value on the right. */
export function SelectField({ label, className, id, children, ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className={cx('flex items-center justify-between gap-4', className)}>
      <label htmlFor={selectId} className="min-w-0 text-label text-fg-secondary">
        {label}
      </label>
      <select
        id={selectId}
        className={cx(
          CONTROL,
          'w-36 shrink-0 border-line pr-2 text-label enabled:hover:border-fg-muted',
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
