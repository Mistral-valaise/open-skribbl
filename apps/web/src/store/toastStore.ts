import { create } from 'zustand';
import type { MessageKey, MessageParams } from '../i18n/index.js';

export interface ToastContent {
  /** Changes with every toast, so showing the same text twice restarts the timer. */
  id: number;
  key: MessageKey;
  params?: MessageParams;
}

/** At most one toast is visible; a new one replaces it (DESIGN §8). */
export const useToastStore = create<{ toast: ToastContent | null }>(() => ({ toast: null }));

let nextId = 1;

export function showToast(key: MessageKey, params?: MessageParams): void {
  useToastStore.setState({ toast: { id: nextId++, key, params } });
}

export function dismissToast(id: number): void {
  if (useToastStore.getState().toast?.id === id) useToastStore.setState({ toast: null });
}
