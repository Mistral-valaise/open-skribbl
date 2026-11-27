import { cleanNickname, ROOM_CODE_LENGTH } from '@kritzel/shared';
import { ArrowRight, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { createRoom } from '../../connection/api.js';
import { t, type MessageKey } from '../../i18n/index.js';
import { loadAvatar, loadNickname, saveNickname } from '../../store/identity.js';
import { isRoomCodeShaped, normalizeRoomCode } from '../../store/roomCode.js';
import { requestAutoJoin } from '../../store/session.js';
import { Button } from '../../ui/Button.js';
import { CenteredPage } from '../../ui/CenteredPage.js';
import { TextField } from '../../ui/Field.js';
import { ICON } from '../../ui/IconButton.js';
import { Wordmark } from '../../ui/Wordmark.js';
import { IdentityCard } from './IdentityCard.js';

const CREATE_ERRORS: Record<'rate_limited' | 'server_full' | 'failed', MessageKey> = {
  rate_limited: 'home.createRateLimited',
  server_full: 'error.server_full',
  failed: 'home.createFailed',
};

export function HomeScreen() {
  const [, navigate] = useLocation();
  const [avatar] = useState(loadAvatar);
  const [nickname, setNickname] = useState(loadNickname);
  const [showNicknameError, setShowNicknameError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<MessageKey | null>(null);
  const [code, setCode] = useState('');
  const [showCodeError, setShowCodeError] = useState(false);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = cleanNickname(nickname);
    if (!cleaned) {
      setShowNicknameError(true);
      return;
    }
    saveNickname(cleaned);
    setCreating(true);
    setCreateError(null);
    const result = await createRoom();
    if (!result.ok) {
      setCreating(false);
      setCreateError(CREATE_ERRORS[result.reason]);
      return;
    }
    requestAutoJoin(result.code);
    navigate(`/r/${result.code}`);
  };

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!isRoomCodeShaped(normalized)) {
      setShowCodeError(true);
      return;
    }
    const cleaned = cleanNickname(nickname);
    if (cleaned) saveNickname(cleaned);
    navigate(`/r/${normalized}`);
  };

  const codeInvalid = showCodeError && !isRoomCodeShaped(normalizeRoomCode(code));

  return (
    <CenteredPage footer={t('app.footer')}>
      <header className="flex flex-col items-center gap-4 pb-2 text-center">
        <h1>
          <Wordmark />
        </h1>
        <p className="text-subheading font-normal text-fg-secondary">{t('app.tagline')}</p>
      </header>

      <form onSubmit={handleCreate} noValidate className="flex flex-col gap-4">
        <IdentityCard
          avatar={avatar}
          nickname={nickname}
          onNicknameChange={setNickname}
          showError={showNicknameError}
          autoFocus
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          busy={creating}
          icon={<Plus {...ICON} />}
          data-testid="create-room"
        >
          {t('home.createRoom')}
        </Button>
        {createError ? (
          <p role="alert" className="text-center text-label text-danger">
            {t(createError)}
          </p>
        ) : null}
      </form>

      <div className="flex items-center gap-4 text-caption text-fg-muted uppercase">
        <span className="h-px flex-1 bg-line" />
        {t('home.or')}
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleJoin} noValidate className="flex flex-col gap-1.5">
        <label htmlFor="join-code" className="text-label text-fg-secondary">
          {t('home.joinWithCode')}
        </label>
        <div className="flex items-start gap-3">
          <TextField
            id="join-code"
            className="min-w-0 flex-1"
            hideLabel
            label={t('home.codeLabel')}
            data-testid="join-code-input"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t('home.codePlaceholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            inputClassName="font-mono uppercase tracking-[0.2em] placeholder:tracking-[0.2em]"
            error={codeInvalid ? t('home.codeInvalid', { length: ROOM_CODE_LENGTH }) : null}
          />
          <Button
            type="submit"
            className="min-h-11"
            icon={<ArrowRight {...ICON} />}
            data-testid="join-code-submit"
          >
            {t('home.join')}
          </Button>
        </div>
      </form>
    </CenteredPage>
  );
}
