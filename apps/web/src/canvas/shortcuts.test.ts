import { describe, expect, it } from 'vitest';
import { shortcutFor, type ShortcutKey } from './shortcuts.js';

const press = (key: string, modifiers: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe('shortcutFor', () => {
  it('AC-003-15: B, E and F select the brush, the eraser and the fill tool', () => {
    expect(shortcutFor(press('b'))).toEqual({ action: 'tool', tool: 'brush' });
    expect(shortcutFor(press('E'))).toEqual({ action: 'tool', tool: 'eraser' });
    expect(shortcutFor(press('f'))).toEqual({ action: 'tool', tool: 'fill' });
  });

  it('AC-003-15: 1 to 5 select the five sizes', () => {
    expect(['1', '2', '3', '4', '5'].map((key) => shortcutFor(press(key)))).toEqual(
      [0, 1, 2, 3, 4].map((index) => ({ action: 'size', index })),
    );
    expect(shortcutFor(press('6'))).toBeNull();
  });

  it('AC-003-15: Ctrl+Z or Cmd+Z undoes; with Shift, or Ctrl+Y, it redoes', () => {
    expect(shortcutFor(press('z', { ctrlKey: true }))).toEqual({ action: 'undo' });
    expect(shortcutFor(press('z', { metaKey: true }))).toEqual({ action: 'undo' });
    expect(shortcutFor(press('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ action: 'redo' });
    expect(shortcutFor(press('Z', { metaKey: true, shiftKey: true }))).toEqual({ action: 'redo' });
    expect(shortcutFor(press('y', { ctrlKey: true }))).toEqual({ action: 'redo' });
  });

  it('leaves browser shortcuts and other keys alone', () => {
    expect(shortcutFor(press('f', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(press('b', { altKey: true }))).toBeNull();
    expect(shortcutFor(press('z'))).toBeNull();
    expect(shortcutFor(press('Enter'))).toBeNull();
  });
});
