import type { ParticipantView, RoomView } from '@kritzel/shared';
import { Eye, Hourglass } from 'lucide-react';
import { DrawingCanvas } from '../../canvas/DrawingCanvas.js';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';
import { Toolbar } from './Toolbar.js';
import { TurnEndOverlay } from './TurnEndOverlay.js';
import { WordChoiceOverlay } from './WordChoiceOverlay.js';

function ChoosingOverlay({ drawer }: { drawer: ParticipantView }) {
  return (
    <div className="absolute inset-0 grid animate-fade-in place-items-center bg-scrim p-4 backdrop-blur-sm">
      <div className="flex animate-overlay flex-col items-center gap-3 text-center">
        <Avatar avatar={drawer.avatar} name={drawer.nickname} size={64} className="shadow-md" />
        <p className="text-subheading text-fg">{t('game.isChoosing', { name: drawer.nickname })}</p>
      </div>
    </div>
  );
}

/** The thin line under the canvas for everyone who is not drawing (DESIGN §9). */
function StageCaption({ view, drawer }: { view: RoomView; drawer: ParticipantView | undefined }) {
  const me = view.participants.find((entry) => entry.id === view.you.id);
  const isDrawer = view.drawerId === view.you.id;
  const note =
    view.you.role === 'spectator'
      ? { icon: <Eye size={14} strokeWidth={1.75} aria-hidden />, text: t('game.spectating') }
      : me?.waiting
        ? { icon: <Hourglass size={14} strokeWidth={1.75} aria-hidden />, text: t('game.waiting') }
        : null;

  return (
    <div className="flex min-h-9 w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 text-caption text-fg-secondary">
      {drawer && view.phase === 'drawing' ? (
        <span className="flex items-center gap-2">
          <Avatar avatar={drawer.avatar} name={drawer.nickname} size={28} />
          {isDrawer ? t('game.youAreDrawing') : t('game.isDrawing', { name: drawer.nickname })}
        </span>
      ) : null}
      {note ? (
        <span className="flex items-center gap-1.5 text-fg-muted">
          {note.icon}
          {note.text}
        </span>
      ) : null}
    </div>
  );
}

/** The canvas with its overlays and, below it, the toolbar or the caption. */
export function Stage({ view, className }: { view: RoomView; className?: string }) {
  const wordChoices = useRoomStore((state) => state.wordChoices);
  const isDrawer = view.drawerId === view.you.id;
  const drawer = view.participants.find((entry) => entry.id === view.drawerId);
  // The toolbar is for the drawer and for the drawing phase only (spec 003, AC-003-16).
  const canDraw = isDrawer && view.phase === 'drawing';

  let overlay = null;
  if (view.phase === 'choosing') {
    if (isDrawer && wordChoices) overlay = <WordChoiceOverlay words={wordChoices} />;
    else if (!isDrawer && drawer) overlay = <ChoosingOverlay drawer={drawer} />;
  } else if (view.phase === 'turnEnd') {
    overlay = <TurnEndOverlay view={view} />;
  }

  return (
    <section className={cx('flex min-w-0 flex-col items-center gap-1 sm:gap-3', className)}>
      {/* A ring instead of a border: the frame's box, and with it the canvas, stays exactly 4:3. */}
      <div className="stage-frame relative shrink-0 overflow-hidden bg-paper shadow-lg ring-1 ring-line sm:rounded-lg">
        <DrawingCanvas interactive={canDraw} />
        {overlay}
      </div>
      {canDraw ? <Toolbar /> : <StageCaption view={view} drawer={drawer} />}
    </section>
  );
}
