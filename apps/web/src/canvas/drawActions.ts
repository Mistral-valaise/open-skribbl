import { BRUSH_SIZES } from '@kritzel/shared';
import { drawOp } from '../store/session.js';
import { selectSize, selectTool } from '../store/toolStore.js';
import type { Shortcut } from './shortcuts.js';
import { endStroke } from './strokeCapture.js';

/** Toolbar actions that change the drawing. A stroke in progress is finished first. */

export function undo(): void {
  endStroke();
  drawOp({ type: 'undo' });
}

export function redo(): void {
  endStroke();
  drawOp({ type: 'redo' });
}

export function clearCanvas(): void {
  endStroke();
  drawOp({ type: 'clear' });
}

export function runShortcut(shortcut: Shortcut): void {
  switch (shortcut.action) {
    case 'tool':
      return selectTool(shortcut.tool);
    case 'size': {
      const size = BRUSH_SIZES[shortcut.index];
      if (size !== undefined) selectSize(size);
      return;
    }
    case 'undo':
      return undo();
    case 'redo':
      return redo();
  }
}

/** Shortcuts stay quiet while the participant types (spec 003, AC-003-15). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
