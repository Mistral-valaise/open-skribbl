import type { RoomView, Settings } from '@kritzel/shared';
import { Lock } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';
import { SelectField } from '../../ui/Field.js';
import { Panel } from '../../ui/Panel.js';
import { SETTING_VALUES } from './settingValues.js';

type NumericSetting = 'rounds' | 'drawTime' | 'wordChoices' | 'hints' | 'maxPlayers';

const update = (patch: Partial<Settings>) => send({ type: 'settings.update', settings: patch });

interface SettingsPanelProps {
  view: RoomView;
  editable: boolean;
}

/** The rules of the next game: editable for the host, read-only for everyone else (spec 001). */
export function SettingsPanel({ view, editable }: SettingsPanelProps) {
  const { settings } = view;
  const playerCount = view.participants.filter((entry) => entry.role === 'player').length;

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
      {editable ? null : (
        <p className="flex items-center gap-2 text-caption text-fg-muted">
          <Lock size={14} strokeWidth={1.75} aria-hidden />
          {t('settings.readOnly')}
        </p>
      )}
    </Panel>
  );
}
