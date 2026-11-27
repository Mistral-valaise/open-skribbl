import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../i18n/index.js';
import { Button } from './Button.js';
import { ICON } from './IconButton.js';
import { ShellControls } from './ShellControls.js';
import { Wordmark } from './Wordmark.js';

interface RoomHeaderProps {
  onLeave: () => void;
  children?: ReactNode;
}

/** The header of the lobby and the results: wordmark on the left, Leave on the right. */
export function RoomHeader({ onLeave, children }: RoomHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <Wordmark size="sm" />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-3">
        {children}
        <ShellControls />
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
