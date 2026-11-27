/** The parts of a key press the shortcuts look at. */
export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type Shortcut =
  | { action: 'tool'; tool: 'brush' | 'eraser' | 'fill' }
  | { action: 'size'; index: number }
  | { action: 'undo' }
  | { action: 'redo' };

/** Maps a key press to a drawing shortcut (spec 003, "Shortcuts"). */
export function shortcutFor(event: ShortcutKey): Shortcut | null {
  const key = event.key.toLowerCase();
  if (event.altKey) return null;
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return { action: event.shiftKey ? 'redo' : 'undo' };
    if (key === 'y' && event.ctrlKey && !event.shiftKey) return { action: 'redo' };
    return null;
  }
  if (key === 'b') return { action: 'tool', tool: 'brush' };
  if (key === 'e') return { action: 'tool', tool: 'eraser' };
  if (key === 'f') return { action: 'tool', tool: 'fill' };
  const index = ['1', '2', '3', '4', '5'].indexOf(key);
  return index >= 0 ? { action: 'size', index } : null;
}
