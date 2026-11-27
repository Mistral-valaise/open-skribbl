import type { ParticipantView, RoomView } from '@kritzel/shared';
import { Eye, Hourglass } from 'lucide-react';
import { DrawingCanvas } from '../../canvas/DrawingCanvas.js';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { Avatar } from '../../ui/Avatar.js';
import { cx } from '../../ui/cx.js';
import { LikeButtons } from './LikeButtons.js';
import { ReactionBar } from './ReactionBar.js';
import { ReactionLayer } from './ReactionLayer.js';
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

const NOTE = 'items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-caption text-accent-fg';

/**
 * What this participant is in the current turn (spec 007): a spectator, a
 * player waiting for the next turn after a late join, or neither.
 */
function PresenceNote({ view }: { view: RoomView }) {
  const me = view.participants.find((entry) => entry.id === view.you.id);
  // While a drawing is guessed, phones show this in the top bar, above the mask, to save a row.
  const display = view.phase === 'drawing' ? 'hidden sm:flex' : 'flex';
  if (view.you.role === 'spectator') {
    return (
      <span
        data-testid="spectator-note"
        title={t('game.spectatingHint')}
        className={cx(NOTE, display)}
      >
        <Eye size={14} strokeWidth={1.75} aria-hidden />
        {t('game.spectating')}
      </span>
    );
  }
  if (me?.waiting) {
    return (
      <span data-testid="waiting-note" title={t('game.waitingHint')} className={cx(NOTE, display)}>
        <Hourglass size={14} strokeWidth={1.75} aria-hidden />
        {t('game.waiting')}
      </span>
    );
  }
  return null;
}

/**
 * The row under the canvas for everyone who is not drawing: who draws, the
 * reaction bar and the like buttons (DESIGN §9, spec 008).
 */
function StageFooter({ view, drawer }: { view: RoomView; drawer: ParticipantView | undefined }) {
  const me = view.participants.find((entry) => entry.id === view.you.id);
  const isDrawer = view.drawerId === view.you.id;
  const drawing = view.phase === 'drawing';
  // Everyone but the drawer reacts; only the turn's guessers like (spec 008).
  const canReact = drawing && !isDrawer;
  const canLike =
    (drawing || (view.phase === 'turnEnd' && view.word !== null)) &&
    view.you.role === 'player' &&
    !isDrawer &&
    me?.waiting !== true;

  return (
    <div className="flex min-h-11 w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 text-caption text-fg-secondary sm:justify-between sm:px-0">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {drawer && drawing ? (
          <span className="hidden items-center gap-2 sm:flex">
            <Avatar avatar={drawer.avatar} name={drawer.nickname} size={28} />
            {t('game.isDrawing', { name: drawer.nickname })}
          </span>
        ) : null}
        <PresenceNote view={view} />
      </div>
      <div className="flex items-center gap-2">
        {canReact ? <ReactionBar /> : null}
        {canLike ? <LikeButtons /> : null}
      </div>
    </div>
  );
}

/** The canvas with its overlays and, below it, the toolbar or the footer row. */
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
    <section className={cx('stage flex min-w-0 flex-col items-center gap-1 sm:gap-3', className)}>
      {/* A ring instead of a border: the frame's box, and with it the canvas, stays exactly 4:3. */}
      <div className="stage-width stage-frame relative shrink-0 overflow-hidden bg-paper shadow-lg ring-1 ring-line sm:rounded-lg">
        <DrawingCanvas interactive={canDraw} />
        <ReactionLayer />
        {overlay}
      </div>
      {/* Tools, reactions and likes wait while the on-screen keyboard is open (spec 011). */}
      <div className="contents typing:hidden">
        {canDraw ? <Toolbar /> : <StageFooter view={view} drawer={drawer} />}
      </div>
    </section>
  );
}
