import type { RoomView } from '@kritzel/shared';
import { t } from '../../i18n/index.js';
import { WordMask } from '../../ui/WordMask.js';

/**
 * The centre of the top bar: the word for those who know it, the mask for
 * guessers, and who is choosing during the choosing phase (DESIGN §9).
 */
export function WordArea({ view }: { view: RoomView }) {
  const isDrawer = view.drawerId === view.you.id;
  const drawerName = view.participants.find((entry) => entry.id === view.drawerId)?.nickname ?? '';

  let label: string | null = null;
  let content;
  if (view.phase === 'choosing') {
    label = isDrawer ? t('game.yourTurn') : null;
    content = (
      <span className="text-label text-fg-secondary sm:text-body">
        {isDrawer ? t('game.chooseWord') : t('game.isChoosing', { name: drawerName })}
      </span>
    );
  } else if (view.word !== null) {
    label =
      view.phase === 'turnEnd'
        ? t('game.theWordWas')
        : isDrawer
          ? t('game.drawThis')
          : t('game.youGuessed');
    content = (
      <span
        data-testid="word-display"
        className="font-mono text-subheading font-semibold break-words text-fg sm:text-heading"
      >
        {view.word}
      </span>
    );
  } else if (view.mask !== null) {
    label = t('game.guessThis');
    content = <WordMask mask={view.mask} />;
  } else {
    content = (
      <span className="text-label text-fg-secondary sm:text-body">
        {view.phase === 'turnEnd' ? t('turnEnd.noWord') : t('game.getReady')}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      {label ? <span className="text-caption text-fg-muted uppercase">{label}</span> : null}
      {content}
    </div>
  );
}
