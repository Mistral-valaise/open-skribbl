import { letterCounts, type RoomView } from '@kritzel/shared';
import { useEffect } from 'react';
import { playSound } from '../../audio/index.js';
import { isTickSecond } from '../../audio/roomSounds.js';
import { secondsLeft } from '../../connection/clock.js';
import { t } from '../../i18n/index.js';
import { announce } from '../../ui/Announcer.js';
import { useRemaining } from './useRemaining.js';

/** The marks of the drawing phase that are announced (spec 011, "Accessibility"). */
const ANNOUNCED_SECONDS = [30, 10];

/** What a screen reader user is told when the phase or the drawer changes. */
function phaseAnnouncement(view: RoomView): string {
  const isDrawer = view.drawerId === view.you.id;
  const drawer = view.participants.find((entry) => entry.id === view.drawerId)?.nickname ?? '';
  const me = view.participants.find((entry) => entry.id === view.you.id);
  switch (view.phase) {
    case 'choosing':
      return isDrawer ? t('announce.yourTurn') : t('game.isChoosing', { name: drawer });
    case 'drawing':
      if (isDrawer && view.word !== null) return t('announce.draw', { word: view.word });
      if (view.you.role === 'spectator' || me?.waiting || view.mask === null) {
        return t('game.isDrawing', { name: drawer });
      }
      return t('announce.guess', { name: drawer, counts: letterCounts(view.mask).join(', ') });
    case 'turnEnd':
      return view.word === null ? t('turnEnd.noWord') : t('announce.turnEnd', { word: view.word });
    default:
      return '';
  }
}

/**
 * The cues of a turn that are not on the screen as text: the tick of the last
 * ten seconds, and the announcements of phase changes and time marks.
 */
export function useTurnCues(view: RoomView): void {
  const seconds = secondsLeft(useRemaining());
  const { phase, drawerId } = view;
  const { drawTime } = view.settings;

  useEffect(() => {
    if (isTickSecond(phase, seconds)) playSound('tick');
    // A mark that is the whole draw time is the start of the phase, which has its own announcement.
    if (phase === 'drawing' && seconds < drawTime && ANNOUNCED_SECONDS.includes(seconds)) {
      announce(t('game.timeLeft', { seconds }));
    }
  }, [phase, seconds, drawTime]);

  // The effect follows the phase and the drawer, not every snapshot.
  useEffect(() => {
    announce(phaseAnnouncement(view));
  }, [phase, drawerId]);
}
