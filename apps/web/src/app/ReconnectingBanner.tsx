import { t } from '../i18n/index.js';
import { useRoomStore } from '../store/roomStore.js';
import { Spinner } from '../ui/Spinner.js';

/** Shown while the connection to the room is lost and the client retries (spec 007). */
export function ReconnectingBanner() {
  const reconnecting = useRoomStore((state) => state.status === 'reconnecting');
  if (!reconnecting) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-18 z-50 flex justify-center px-4">
      <div
        data-testid="reconnecting"
        role="status"
        className="flex animate-enter items-center gap-2 rounded-full border border-line bg-surface-overlay py-2 pr-4 pl-3 text-label text-fg shadow-md"
      >
        <Spinner className="size-4 text-warning" />
        {t('conn.reconnecting')}
      </div>
    </div>
  );
}
