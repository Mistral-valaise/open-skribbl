import { cleanNickname, type Role } from '@kritzel/shared';
import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { t } from '../../i18n/index.js';
import { loadAvatar, loadNickname, saveNickname } from '../../store/identity.js';
import { Button } from '../../ui/Button.js';
import { CenteredPage } from '../../ui/CenteredPage.js';
import { ICON } from '../../ui/IconButton.js';
import { Wordmark } from '../../ui/Wordmark.js';
import { IdentityCard } from './IdentityCard.js';

interface JoinFormProps {
  code: string;
  /** Why the previous attempt failed, already translated. */
  error?: { title: string; body: string } | null;
  onJoin: (nickname: string, role: Role) => void;
}

/** The form a visitor of `/r/<CODE>` fills in to enter the room (spec 001, AC-001-16). */
export function JoinForm({ code, error, onJoin }: JoinFormProps) {
  const [avatar] = useState(loadAvatar);
  const [nickname, setNickname] = useState(loadNickname);
  const [showNicknameError, setShowNicknameError] = useState(false);
  const [spectator, setSpectator] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = cleanNickname(nickname);
    if (!cleaned) {
      setShowNicknameError(true);
      return;
    }
    saveNickname(cleaned);
    onJoin(cleaned, spectator ? 'spectator' : 'player');
  };

  return (
    <CenteredPage>
      <header className="flex flex-col items-center gap-6 text-center">
        <Link href="/" aria-label={t('room.backHome')} className="rounded-sm">
          <Wordmark size="sm" />
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-title text-fg">{t('join.title')}</h1>
          <p className="font-mono text-label tracking-[0.2em] text-fg-secondary">
            {t('join.room', { code })}
          </p>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="text-label text-fg">{error.title}</p>
          <p className="text-caption text-fg-secondary">{error.body}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <IdentityCard
          avatar={avatar}
          nickname={nickname}
          onNicknameChange={setNickname}
          showError={showNicknameError}
          autoFocus
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1">
          <input
            type="checkbox"
            data-testid="join-spectator"
            checked={spectator}
            onChange={(event) => setSpectator(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-accent"
          />
          <span className="flex flex-col">
            <span className="text-label text-fg">{t('join.spectator')}</span>
            <span className="text-caption text-fg-secondary">{t('join.spectatorHint')}</span>
          </span>
        </label>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          icon={<LogIn {...ICON} />}
          data-testid="join-room"
        >
          {t('join.submit')}
        </Button>
      </form>
    </CenteredPage>
  );
}
