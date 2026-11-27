import { REACTION_COOLDOWN_MS, REACTION_EMOJI } from '@kritzel/shared';
import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { send } from '../../store/session.js';

/**
 * Six emoji for everyone but the drawer (spec 008). The server accepts one
 * reaction per cooldown; the buttons rest for that long so none is lost.
 */
export function ReactionBar() {
  const [resting, setResting] = useState(false);

  useEffect(() => {
    if (!resting) return;
    const timer = window.setTimeout(() => setResting(false), REACTION_COOLDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [resting]);

  return (
    <div
      data-testid="reaction-bar"
      role="group"
      aria-label={t('reaction.bar')}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface-raised px-1"
    >
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          data-testid="reaction-button"
          data-emoji={emoji}
          aria-label={t('reaction.send', { emoji })}
          disabled={resting}
          onClick={() => {
            if (send({ type: 'reaction.send', emoji })) setResting(true);
          }}
          className="grid h-10 w-10 place-items-center rounded-full text-subheading leading-none transition-[transform,opacity] motion-fast hover:scale-125 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 pointer-coarse:h-11"
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}
