import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { showToast } from '../../store/toastStore.js';
import { Button } from '../../ui/Button.js';
import { ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';
import { inviteLink } from './inviteLink.js';

const COPIED_MS = 2000;

/** Room code, invite link and the Copy link button (spec 001, AC-001-15). */
export function InviteCard({ code }: { code: string }) {
  const link = inviteLink(window.location.origin, code);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      showToast('lobby.copyFailed');
    }
  };

  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="text-caption text-fg-muted uppercase">{t('lobby.roomCode')}</span>
          <span
            data-testid="room-code"
            className="font-mono text-title tracking-[0.18em] text-fg select-all"
          >
            {code}
          </span>
        </div>
        <p className="text-label font-normal text-fg-secondary">{t('lobby.inviteHint')}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          data-testid="invite-link"
          aria-label={t('lobby.inviteLink')}
          readOnly
          value={link}
          onFocus={(event) => event.target.select()}
          className="min-h-11 min-w-0 flex-1 rounded-sm border border-line bg-surface-overlay px-3 font-mono text-label font-normal text-fg-secondary"
        />
        <Button
          variant="primary"
          className="min-h-11 sm:min-w-36"
          icon={copied ? <Check {...ICON} /> : <Copy {...ICON} />}
          onClick={copy}
          data-testid="copy-link"
        >
          <span aria-live="polite">{copied ? t('lobby.copied') : t('lobby.copyLink')}</span>
        </Button>
      </div>
    </Panel>
  );
}
