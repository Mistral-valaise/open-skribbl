import { cleanNickname, NICKNAME_MAX_LENGTH, type Avatar as AvatarParts } from '@kritzel/shared';
import { t } from '../../i18n/index.js';
import { Avatar } from '../../ui/Avatar.js';
import { TextField } from '../../ui/Field.js';
import { Panel } from '../../ui/Panel.js';

interface IdentityCardProps {
  avatar: AvatarParts;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
  /** Whether to show the validation message for the current nickname. */
  showError: boolean;
  autoFocus?: boolean;
}

/** Avatar and nickname: the whole identity of a player (spec 010). */
export function IdentityCard({
  avatar,
  nickname,
  onNicknameChange,
  showError,
  autoFocus,
}: IdentityCardProps) {
  const invalid = showError && cleanNickname(nickname) === null;
  return (
    <Panel as="div" className="flex items-start gap-4 p-4 sm:p-6">
      <Avatar avatar={avatar} name={cleanNickname(nickname) ?? ''} size={64} className="mt-1" />
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
    </Panel>
  );
}
