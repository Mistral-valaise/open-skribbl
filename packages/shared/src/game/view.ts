import type { ParticipantView, RankingEntry, RoomView } from '../protocol.js';
import { rank } from '../scoring.js';
import { buildMask } from '../words/mask.js';
import type { RoomState } from './state.js';

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
  const turnOver = state.phase === 'turnEnd' || state.phase === 'gameEnd';
  const maySeeWord =
    wordKnown && (turnOver || turn.drawerId === participantId || participantId in turn.guessed);
  const isHost = state.hostId === participantId;

  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    you: { id: participantId, role: seat?.role ?? 'spectator' },
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
        ? { ...turn.end, deltas: { ...turn.end.deltas } }
        : null,
    results: state.phase === 'gameEnd' ? { ranking: finalRanking(state) } : null,
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
