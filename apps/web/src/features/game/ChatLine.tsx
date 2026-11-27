import type { SystemMessageKey } from '@kritzel/shared';
import {
  Check,
  Crown,
  Flag,
  KeyRound,
  LogIn,
  LogOut,
  Sparkles,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { t } from '../../i18n/index.js';
import type { ChatEntry } from '../../store/roomReducer.js';
import { cx } from '../../ui/cx.js';

const LINE = 'flex animate-enter items-start gap-2 rounded-sm px-2 py-1 text-label font-normal';
const GLYPH = { size: 16, strokeWidth: 1.75, 'aria-hidden': true, className: 'mt-0.5 shrink-0' };

const SYSTEM_STYLE: Record<SystemMessageKey, { icon: LucideIcon; tone: string }> = {
  joined: { icon: LogIn, tone: 'text-info' },
  left: { icon: LogOut, tone: 'text-fg-muted' },
  guessed: { icon: Check, tone: 'bg-success/10 text-success' },
  turn_ended: { icon: Flag, tone: 'text-info' },
  drawer_left: { icon: LogOut, tone: 'text-danger' },
  new_host: { icon: Crown, tone: 'text-warning' },
  kicked: { icon: UserMinus, tone: 'text-danger' },
};

interface ChatLineProps {
  entry: ChatEntry;
  /** The reader's participant id, to mark their own messages. */
  youId: string;
}

/**
 * One line of the chat log (DESIGN §8, "ChatMessage"). Names and texts are
 * rendered as text nodes, never as markup (spec 004, AC-004-16).
 */
export function ChatLine({ entry, youId }: ChatLineProps) {
  if (entry.entry === 'close') {
    return (
      <li
        data-testid="chat-message"
        data-kind="close"
        className={cx(LINE, 'bg-warning/10 text-warning')}
      >
        <Sparkles {...GLYPH} />
        <span className="min-w-0 break-words">{t('chat.close', { text: entry.text })}</span>
      </li>
    );
  }
  if (entry.entry === 'correct') {
    return (
      <li
        data-testid="chat-message"
        data-kind="correct"
        className={cx(LINE, 'bg-success/15 font-medium text-success')}
      >
        <Check {...GLYPH} strokeWidth={2.5} />
        <span className="min-w-0 break-words">{t('chat.correct', { word: entry.word })}</span>
      </li>
    );
  }

  const { message } = entry;
  if (message.kind === 'system') {
    const { icon: Icon, tone } = SYSTEM_STYLE[message.key];
    return (
      <li
        data-testid="chat-message"
        data-kind="system"
        data-key={message.key}
        className={cx(LINE, tone)}
      >
        <Icon {...GLYPH} />
        <span className="min-w-0 break-words">{t(`system.${message.key}`, message.params)}</span>
      </li>
    );
  }

  const guessedChannel = message.channel === 'guessed';
  return (
    <li
      data-testid="chat-message"
      data-kind="chat"
      data-channel={message.channel}
      data-from={message.from}
      title={guessedChannel ? t('chat.guessedChannel') : undefined}
      className={cx(LINE, guessedChannel && 'rounded-l-none border-l-2 border-accent bg-accent/10')}
    >
      {guessedChannel ? <KeyRound {...GLYPH} className="mt-0.5 shrink-0 text-accent-fg" /> : null}
      <span className="min-w-0 break-words text-fg">
        <span
          className={cx(
            'font-semibold',
            message.from === youId ? 'text-accent-fg' : 'text-fg-secondary',
          )}
        >
          {message.name}
        </span>{' '}
        {message.text}
        {guessedChannel ? <span className="sr-only"> ({t('chat.guessedChannel')})</span> : null}
      </span>
    </li>
  );
}
