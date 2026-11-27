import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { setLike } from '../../store/session.js';
import { IconButton, ICON } from '../../ui/IconButton.js';

/** Thumbs up or down for the current drawing; the choice can change until the turn is over (spec 008). */
export function LikeButtons() {
  const myLike = useRoomStore((state) => state.myLike);
  return (
    <div
      role="group"
      aria-label={t('like.group')}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface-raised px-1"
    >
      <IconButton
        data-testid="like-up"
        label={t('like.up')}
        icon={<ThumbsUp {...ICON} />}
        pressed={myLike === 'up'}
        className="rounded-full"
        onClick={() => setLike('up')}
      />
      <IconButton
        data-testid="like-down"
        label={t('like.down')}
        icon={<ThumbsDown {...ICON} />}
        pressed={myLike === 'down'}
        className="rounded-full"
        onClick={() => setLike('down')}
      />
    </div>
  );
}
