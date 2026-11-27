import {
  CUSTOM_WORDS_MAX,
  CUSTOM_WORDS_ONLY_MIN,
  MAX_FRAME_BYTES,
  parseCustomWords,
  WORD_MAX_LENGTH,
  type ClientMessage,
  type RoomView,
  type Settings,
} from '@kritzel/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';
import { cx } from '../../ui/cx.js';

/** Typing pauses this long before the words are sent; leaving the field sends at once. */
const SEND_DELAY_MS = 300;
/** Invalid entries named in the error text before the rest is cut off. */
const NAMED_ENTRIES = 12;

const toText = (words: readonly string[]) => words.join(', ');
const fingerprint = (words: readonly string[]) => JSON.stringify(words);

function fitsInOneFrame(message: ClientMessage): boolean {
  return new TextEncoder().encode(JSON.stringify(message)).length <= MAX_FRAME_BYTES;
}

/**
 * The host's custom words (spec 006): free text, parsed with the shared rules.
 * While an entry is invalid nothing is sent and the offending entries are named.
 */
export function CustomWordsField({ view }: { view: RoomView }) {
  const { customWords, customWordsOnly } = view.settings;
  const [text, setText] = useState(() => toText(customWords));
  const [tooLarge, setTooLarge] = useState(false);
  // The words the server is known to have, or is about to have, as last seen from here.
  const known = useRef(fingerprint(customWords));
  const timer = useRef<number | undefined>(undefined);
  const onlyRef = useRef(customWordsOnly);
  onlyRef.current = customWordsOnly;
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  // The words changed on the server without this field (a rejoin): show them.
  useEffect(() => {
    const incoming = fingerprint(customWords);
    if (incoming === known.current) return;
    known.current = incoming;
    setText(toText(customWords));
  }, [customWords]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (value: string) => {
    window.clearTimeout(timer.current);
    const result = parseCustomWords(value);
    if (!result.ok || fingerprint(result.words) === known.current) return;
    const patch: Partial<Settings> = { customWords: result.words };
    // "Use only custom words" cannot stay on below its minimum (spec 006).
    if (onlyRef.current && result.words.length < CUSTOM_WORDS_ONLY_MIN) {
      patch.customWordsOnly = false;
    }
    const message: ClientMessage = { type: 'settings.update', settings: patch };
    const fits = fitsInOneFrame(message);
    setTooLarge(!fits);
    if (fits && send(message)) known.current = fingerprint(result.words);
  };

  const handleChange = (value: string) => {
    setText(value);
    setTooLarge(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(value), SEND_DELAY_MS);
  };

  const parsed = parseCustomWords(text);
  const errors: string[] = [];
  if (!parsed.ok && parsed.invalid.length > 0) {
    const named = parsed.invalid.slice(0, NAMED_ENTRIES).join(', ');
    const entries = parsed.invalid.length > NAMED_ENTRIES ? `${named}, …` : named;
    errors.push(t('settings.customWordsInvalid', { entries }));
    errors.push(t('settings.customWordsRule', { max: WORD_MAX_LENGTH }));
  }
  if (!parsed.ok && parsed.tooMany) {
    errors.push(t('settings.customWordsTooMany', { max: CUSTOM_WORDS_MAX }));
  }
  if (tooLarge) errors.push(t('settings.customWordsTooLarge'));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-label text-fg-secondary">
          {t('settings.customWords')}
        </label>
        {parsed.ok ? (
          <span className="font-mono text-caption text-fg-muted tabular-nums">
            {t('settings.customWordsUsed', { count: parsed.words.length, max: CUSTOM_WORDS_MAX })}
          </span>
        ) : null}
      </div>
      <textarea
        id={fieldId}
        data-testid="setting-customWords"
        name="customWords"
        rows={3}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        placeholder={t('settings.customWordsPlaceholder')}
        spellCheck={false}
        autoCapitalize="off"
        aria-invalid={errors.length > 0 ? true : undefined}
        aria-describedby={errors.length > 0 ? errorId : undefined}
        className={cx(
          'scroll-quiet max-h-48 min-h-20 w-full resize-y rounded-sm border bg-surface-overlay px-3 py-2',
          'text-label font-normal text-fg transition-colors motion-fast',
          errors.length > 0 ? 'border-danger' : 'border-line hover:border-fg-muted',
        )}
      />
      {errors.length > 0 ? (
        <div
          id={errorId}
          data-testid="custom-words-error"
          role="alert"
          className="flex flex-col gap-0.5 text-caption break-words text-danger"
        >
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
