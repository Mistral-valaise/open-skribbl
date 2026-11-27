import { CircleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { t } from '../i18n/index.js';
import { dismissToast, useToastStore } from '../store/toastStore.js';
import { ICON } from './IconButton.js';

const TOAST_MS = 4000;

/** Bottom-centre notice, one at a time, gone after four seconds (DESIGN §8). */
export function Toast() {
  const toast = useToastStore((state) => state.toast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {toast ? (
        <div
          key={toast.id}
          data-testid="toast"
          role="status"
          className="pointer-events-auto flex max-w-md animate-enter items-center gap-3 rounded-md border border-line bg-surface-overlay px-4 py-3 text-label text-fg shadow-md"
        >
          <CircleAlert {...ICON} className="shrink-0 text-warning" />
          {t(toast.key, toast.params)}
        </div>
      ) : null}
    </div>
  );
}
