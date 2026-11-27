import { create } from 'zustand';

/**
 * A visually hidden live region for what sighted players see happen: phase
 * changes and the 30 s and 10 s marks (spec 011, DESIGN §10).
 */
const useAnnouncerStore = create<{ text: string }>(() => ({ text: '' }));

export function announce(text: string): void {
  useAnnouncerStore.setState({ text });
}

export function Announcer() {
  const text = useAnnouncerStore((state) => state.text);
  return (
    <div data-testid="announcer" role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}
