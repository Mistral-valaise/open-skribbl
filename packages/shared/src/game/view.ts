import type { GalleryEntry, ParticipantView, RankingEntry, RoomView } from '../protocol.js';
import { rank } from '../scoring.js';
import { buildMask } from '../words/mask.js';
import type { RoomState, Turn } from './state.js';

/**
 * The single gate for visibility: projects the room into what one participant
 * may see. The secret word reaches a client only through this function.
 */
export function viewFor(state: RoomState, participantId: string, now: number): RoomView {
  const seat = state.seats.find((candidate) => candidate.id === participantId);
  const turn = state.turn;
  const players = state.seats.filter((candidate) => candidate.role === 'player');
  const ranks = new Map(rank(players).map((entry) => [entry.id, entry.rank]));

  const participants: ParticipantView[] = [...state.seats]
    .sort((a, b) => a.joinedSeq - b.joinedSeq)
    .map((candidate) => ({
      id: candidate.id,
      nickname: candidate.nickname,
      avatar: candidate.avatar,
      role: candidate.role,
      connected: candidate.connId !== null,
      waiting: candidate.waiting,
      score: candidate.score,
      rank: ranks.get(candidate.id) ?? null,
      hasGuessed: turn !== null && turn.end === null && candidate.id in turn.guessed,
    }));

  const wordKnown = turn !== null && turn.word !== null;
  const inTurn = state.phase === 'drawing' || state.phase === 'turnEnd';
  const turnOver = state.phase === 'turnEnd' || state.phase === 'gameEnd';
  const maySeeWord =
    wordKnown && (turnOver || turn.drawerId === participantId || participantId in turn.guessed);
  const isHost = state.hostId === participantId;

  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    you: {
      id: participantId,
      role: seat?.role ?? 'spectator',
      like: (inTurn && turn?.likes[participantId]) || null,
    },
    settings: isHost ? state.settings : { ...state.settings, customWords: [] },
    customWordCount: state.settings.customWords.length,
    participants,
    round: state.game?.round ?? 0,
    totalRounds: state.settings.rounds,
    drawerId:
      state.phase === 'lobby' || state.phase === 'gameEnd' ? null : (turn?.drawerId ?? null),
    mask: wordKnown && state.phase === 'drawing' ? buildMask(turn.word!, turn.revealed) : null,
    word: maySeeWord ? turn.word : null,
    phaseEndsAt: state.phaseEndsAt,
    serverNow: now,
    turnEnd:
      state.phase === 'turnEnd' && turn?.end
        ? { ...turn.end, deltas: { ...turn.end.deltas }, likes: likeTotals(turn) }
        : null,
    results:
      state.phase === 'gameEnd'
        ? { ranking: finalRanking(state), gallery: gallery(state), favorite: favorite(state) }
        : null,
  };
}

/** Ranking at game end, including players who left with points (spec 007). */
export function finalRanking(state: RoomState): RankingEntry[] {
  const present = state.seats
    .filter((seat) => seat.role === 'player')
    .map((seat) => ({ ...seat, left: false }));
  const left = (state.game?.leftPlayers ?? [])
    .filter((player) => player.score > 0)
    .map((player) => ({ ...player, left: true }));
  return rank([...present, ...left]).map((entry) => ({
    id: entry.id,
    nickname: entry.nickname,
    avatar: entry.avatar,
    score: entry.score,
    rank: entry.rank,
    left: entry.left,
  }));
}

export function likeTotals(turn: Turn): { up: number; down: number } {
  const values = Object.values(turn.likes);
  return {
    up: values.filter((value) => value === 'up').length,
    down: values.filter((value) => value === 'down').length,
  };
}

/** One entry per completed turn, in play order (spec 008). */
export function gallery(state: RoomState): GalleryEntry[] {
  return (state.game?.turns ?? []).map((turn, turnIndex) => ({
    turnIndex,
    round: turn.round,
    drawerId: turn.drawerId,
    drawerName: turn.drawerName,
    drawerAvatar: turn.drawerAvatar,
    word: turn.word,
    likesUp: turn.likesUp,
    likesDown: turn.likesDown,
    guessedCount: turn.guessedCount,
    guesserCount: turn.guesserCount,
  }));
}

/** The drawing with the most thumbs-up; ties go to the earlier turn. */
export function favorite(state: RoomState): number | null {
  let best: number | null = null;
  let bestLikes = 0;
  (state.game?.turns ?? []).forEach((turn, turnIndex) => {
    if (turn.likesUp > bestLikes) {
      best = turnIndex;
      bestLikes = turn.likesUp;
    }
  });
  return best;
}
