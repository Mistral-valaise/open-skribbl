import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../i18n/index.js';
import { Button } from './Button.js';
import { ICON } from './IconButton.js';
import { LanguageSwitch } from './LanguageSwitch.js';
import { Wordmark } from './Wordmark.js';

interface RoomHeaderProps {
  onLeave: () => void;
  children?: ReactNode;
}

/** The header of the lobby and the results: wordmark on the left, Leave on the right. */
export function RoomHeader({ onLeave, children }: RoomHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Wordmark size="sm" />
      <div className="flex items-center gap-2 sm:gap-3">
        {children}
        <LanguageSwitch />
        <Button
          variant="ghost"
          className="px-2 sm:px-4"
          aria-label={t('room.leave')}
          icon={<LogOut {...ICON} />}
          onClick={onLeave}
          data-testid="leave"
        >
          {/* Phones show the icon only: wordmark, language switch and Leave share one row. */}
          <span className="hidden sm:inline">{t('room.leave')}</span>
        </Button>
      </div>
    </header>
  );
}
