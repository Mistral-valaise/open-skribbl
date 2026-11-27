import { REACTION_FLOAT_MS } from '@kritzel/shared';
import { useEffect } from 'react';
import type { ReactionFloat } from '../../store/roomReducer.js';
import { useRoomStore } from '../../store/roomStore.js';
import { dismissReaction } from '../../store/session.js';

function Float({ reaction }: { reaction: ReactionFloat }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismissReaction(reaction.key), REACTION_FLOAT_MS);
    return () => window.clearTimeout(timer);
  }, [reaction.key]);

  return (
    <span
      data-testid="reaction-float"
      data-emoji={reaction.emoji}
      data-participant-id={reaction.participantId}
      className="absolute bottom-[4%] -translate-x-1/2 animate-float-up text-title leading-none drop-shadow-md select-none"
      style={{ left: `${reaction.left}%`, animationDuration: `${REACTION_FLOAT_MS}ms` }}
    >
      {reaction.emoji}
    </span>
  );
}

/**
 * Reactions floating up over the canvas for everybody, the drawer included
 * (spec 008). With reduced motion they appear in place and fade.
 */
export function ReactionLayer() {
  const reactions = useRoomStore((state) => state.reactions);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {reactions.map((reaction) => (
        <Float key={reaction.key} reaction={reaction} />
      ))}
    </div>
  );
}
