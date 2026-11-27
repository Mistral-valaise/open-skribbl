import { CUSTOM_WORDS_ONLY_MIN, LANGUAGES, type RoomView, type Settings } from '@kritzel/shared';
import { ListPlus, Lock } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';
import { SelectField } from '../../ui/Field.js';
import { Panel } from '../../ui/Panel.js';
import { CustomWordsField } from './CustomWordsField.js';
import { SETTING_VALUES } from './settingValues.js';

type NumericSetting = 'rounds' | 'drawTime' | 'wordChoices' | 'hints' | 'maxPlayers';

/** How long a changed control keeps its new value while the server has not confirmed it. */
const PENDING_MS = 1500;

/** The settings with a single value each; custom words have their own field. */
type ScalarSettings = Omit<Settings, 'customWords'>;

/**
 * Settings as the host's controls show them: a change is visible at once and
 * sent to the server, whose next snapshot confirms it. A change the server
 * does not confirm in time (it was rejected) falls back to the server's value.
 */
function usePendingSettings(settings: Settings) {
  const [pending, setPending] = useState<Partial<ScalarSettings>>({});

  // A confirmed value is no longer pending.
  useEffect(() => {
    setPending((current) => {
      const open = Object.entries(current).filter(
        ([name, value]) => settings[name as keyof ScalarSettings] !== value,
      );
      return open.length === Object.keys(current).length
        ? current
        : (Object.fromEntries(open) as Partial<ScalarSettings>);
    });
  }, [settings]);

  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const timer = window.setTimeout(() => setPending({}), PENDING_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const update = (patch: Partial<ScalarSettings>) => {
    setPending((current) => ({ ...current, ...patch }));
    send({ type: 'settings.update', settings: patch });
  };
  return { shown: { ...settings, ...pending }, update };
}

interface SettingsPanelProps {
  view: RoomView;
  editable: boolean;
}

/** The rules of the next game: editable for the host, read-only for everyone else (spec 001). */
export function SettingsPanel({ view, editable }: SettingsPanelProps) {
  const { shown: settings, update } = usePendingSettings(view.settings);
  const playerCount = view.participants.filter((entry) => entry.role === 'player').length;
  // "Use only custom words" needs enough custom words (spec 006, AC-006-09).
  const onlyAllowed = editable && view.customWordCount >= CUSTOM_WORDS_ONLY_MIN;

  const numeric = (
    name: NumericSetting,
    label: string,
    format: (value: number) => string = String,
    isAllowed: (value: number) => boolean = () => true,
  ) => (
    <SelectField
      label={label}
      data-testid={`setting-${name}`}
      name={name}
      value={settings[name]}
      disabled={!editable}
      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
        update({ [name]: Number(event.target.value) })
      }
    >
      {SETTING_VALUES[name].map((value) => (
        <option key={value} value={value} disabled={!isAllowed(value)}>
          {format(value)}
        </option>
      ))}
    </SelectField>
  );

  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-6">
      <h2 className="text-subheading text-fg">{t('settings.title')}</h2>
      <div className="flex flex-col gap-3">
        <SelectField
          label={t('settings.language')}
          data-testid="setting-language"
          name="language"
          value={settings.language}
          disabled={!editable}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const language = LANGUAGES.find((value) => value === event.target.value);
            if (language) update({ language });
          }}
        >
          {LANGUAGES.map((value) => (
            <option key={value} value={value} lang={value}>
              {t(`language.${value}`)}
            </option>
          ))}
        </SelectField>
        {numeric('rounds', t('settings.rounds'))}
        {numeric('drawTime', t('settings.drawTime'), (seconds) =>
          t('settings.drawTimeValue', { seconds }),
        )}
        {numeric('wordChoices', t('settings.wordChoices'))}
        {numeric('hints', t('settings.hints'))}
        <SelectField
          label={t('settings.difficulty')}
          data-testid="setting-difficulty"
          name="difficulty"
          value={settings.difficulty}
          disabled={!editable}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const difficulty = SETTING_VALUES.difficulty.find(
              (value) => value === event.target.value,
            );
            if (difficulty) update({ difficulty });
          }}
        >
          {SETTING_VALUES.difficulty.map((value) => (
            <option key={value} value={value}>
              {t(`difficulty.${value}`)}
            </option>
          ))}
        </SelectField>
        {/* `maxPlayers` cannot go below the number of seated players. */}
        {numeric('maxPlayers', t('settings.maxPlayers'), String, (value) => value >= playerCount)}
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        {/* The words themselves reach the host only; everyone else sees how many there are. */}
        {editable ? (
          <CustomWordsField view={view} />
        ) : (
          <p className="flex items-center gap-2 text-label text-fg-secondary">
            <ListPlus size={16} strokeWidth={1.75} aria-hidden />
            <span data-testid="custom-word-count" data-count={view.customWordCount}>
              {t('settings.customWordCount', { count: view.customWordCount })}
            </span>
          </p>
        )}
        <label
          className={
            onlyAllowed ? 'flex cursor-pointer items-start gap-3' : 'flex items-start gap-3'
          }
        >
          <input
            type="checkbox"
            data-testid="setting-customWordsOnly"
            name="customWordsOnly"
            checked={settings.customWordsOnly}
            disabled={!onlyAllowed}
            onChange={(event) => update({ customWordsOnly: event.target.checked })}
            className="mt-0.5 size-5 shrink-0 accent-accent disabled:cursor-not-allowed"
          />
          <span className="flex flex-col">
            <span className={onlyAllowed ? 'text-label text-fg' : 'text-label text-fg-muted'}>
              {t('settings.customWordsOnly')}
            </span>
            {editable && view.customWordCount < CUSTOM_WORDS_ONLY_MIN ? (
              <span className="text-caption text-fg-muted">
                {t('settings.customWordsOnlyHint', { min: CUSTOM_WORDS_ONLY_MIN })}
              </span>
            ) : null}
          </span>
        </label>
      </div>
      {editable ? null : (
        <p className="flex items-center gap-2 text-caption text-fg-muted">
          <Lock size={14} strokeWidth={1.75} aria-hidden />
          {t('settings.readOnly')}
        </p>
      )}
    </Panel>
  );
}
