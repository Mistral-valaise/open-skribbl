import { CHAT_MAX_LENGTH, type RoomView } from '@kritzel/shared';
import { SendHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { send } from '../../store/session.js';
import { cx } from '../../ui/cx.js';
import { IconButton, ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';
import { ChatLine } from './ChatLine.js';

/** Scrolled this close to the end, the log keeps following new messages. */
const FOLLOW_THRESHOLD_PX = 48;

/** The chat: the game's one input and its social space (spec 004). */
export function Chat({ view, className }: { view: RoomView; className?: string }) {
  const chat = useRoomStore((state) => state.chat);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const following = useRef(true);

  const me = view.participants.find((entry) => entry.id === view.you.id);
  const isGuesser =
    view.phase === 'drawing' &&
    view.you.role === 'player' &&
    view.drawerId !== view.you.id &&
    me?.waiting !== true;
  const isGuessing = isGuesser && me?.hasGuessed !== true;

  // A guesser can type the moment the drawing phase starts (spec 004, AC-004-18).
  useEffect(() => {
    if (isGuesser) inputRef.current?.focus({ preventScroll: true });
  }, [isGuesser]);

  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && following.current) log.scrollTop = log.scrollHeight;
  }, [chat]);

  const handleScroll = () => {
    const log = logRef.current;
    if (!log) return;
    following.current = log.scrollHeight - log.scrollTop - log.clientHeight < FOLLOW_THRESHOLD_PX;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    // The text stays in the input when it could not be sent, e.g. while reconnecting.
    if (send({ type: 'chat.send', text: trimmed })) {
      setText('');
      following.current = true;
    }
  };

  return (
    <Panel
      aria-label={t('chat.title')}
      className={cx('flex min-h-0 flex-col overflow-hidden', className)}
    >
      <h2 className="hidden px-4 pt-3 pb-1 text-label text-fg-secondary sm:block">
        {t('chat.title')}
      </h2>
      <ul
        ref={logRef}
        data-testid="chat-log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        onScroll={handleScroll}
        className="scroll-quiet flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2"
      >
        {chat.length === 0 ? (
          <li aria-hidden className="m-auto px-4 text-center text-caption text-fg-muted">
            {t('chat.empty')}
          </li>
        ) : null}
        {chat.map((entry) => (
          <ChatLine key={entry.key} entry={entry} youId={view.you.id} />
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-2">
        <input
          ref={inputRef}
          data-testid="chat-input"
          aria-label={t('chat.inputLabel')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={
            isGuessing
              ? t('chat.guessPlaceholder')
              : view.you.role === 'spectator'
                ? t('chat.spectatorPlaceholder')
                : t('chat.chatPlaceholder')
          }
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          className={cx(
            'min-h-11 min-w-0 flex-1 rounded-sm border bg-surface-overlay px-3 text-body text-fg',
            'transition-colors motion-fast',
            isGuessing ? 'border-accent' : 'border-line hover:border-fg-muted',
          )}
        />
        <IconButton
          type="submit"
          label={t('chat.send')}
          icon={<SendHorizontal {...ICON} />}
          disabled={text.trim().length === 0}
          // Keeps the focus in the input when the button is used instead of Enter.
          onMouseDown={(event) => event.preventDefault()}
        />
      </form>
    </Panel>
  );
}
