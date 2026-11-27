import { useSyncExternalStore } from 'react';

/** Follows a CSS media query, for the few layout choices that change the markup. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Phone layout: below the 640 px breakpoint of DESIGN §9. */
export const PHONE_QUERY = '(max-width: 639.98px)';
