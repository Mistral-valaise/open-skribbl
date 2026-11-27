import { cleanNickname, NICKNAME_MAX_LENGTH, type Avatar as AvatarParts } from '@kritzel/shared';
import { t } from '../../i18n/index.js';
import { TextField } from '../../ui/Field.js';
import { Panel } from '../../ui/Panel.js';
import { AvatarPartControls, AvatarPreview } from './AvatarBuilder.js';

interface IdentityCardProps {
  avatar: AvatarParts;
  onAvatarChange: (avatar: AvatarParts) => void;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
  /** Whether to show the validation message for the current nickname. */
  showError: boolean;
  autoFocus?: boolean;
}

/** Avatar builder and nickname: the whole identity of a player (spec 010). */
export function IdentityCard({
  avatar,
  onAvatarChange,
  nickname,
  onNicknameChange,
  showError,
  autoFocus,
}: IdentityCardProps) {
  const cleaned = cleanNickname(nickname);
  const invalid = showError && cleaned === null;
  return (
    <Panel as="div" className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-5">
        <AvatarPreview avatar={avatar} name={cleaned ?? ''} onChange={onAvatarChange} />
        <TextField
          className="min-w-0 flex-1"
          label={t('identity.nickname')}
          data-testid="nickname-input"
          name="nickname"
          value={nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          placeholder={t('identity.nicknamePlaceholder')}
          autoComplete="nickname"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus={autoFocus}
          error={invalid ? t('identity.nicknameInvalid', { max: NICKNAME_MAX_LENGTH }) : null}
        />
      </div>
      <AvatarPartControls avatar={avatar} onChange={onAvatarChange} />
    </Panel>
  );
}
