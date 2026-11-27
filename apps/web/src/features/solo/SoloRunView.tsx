import { CHAT_MAX_LENGTH, SOLO } from '@kritzel/shared';
import { Check, Clock, SendHorizontal, SkipForward, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { secondsLeft } from '../../connection/clock.js';
import { t } from '../../i18n/index.js';
import { Button } from '../../ui/Button.js';
import { cx } from '../../ui/cx.js';
import { IconButton, ICON } from '../../ui/IconButton.js';
import { Panel } from '../../ui/Panel.js';
import { CompactPlayBar, CompactProgress } from '../../ui/CompactPlayBar.js';
import { PlayTopBar, ProgressIndicator } from '../../ui/PlayTopBar.js';
import { TimerRing } from '../../ui/TimerRing.js';
import { useVisibleViewport } from '../../ui/useVisibleViewport.js';
import { WordMask } from '../../ui/WordMask.js';
import { SoloCanvas } from './SoloCanvas.js';
import { SoloCredit } from './SoloCredit.js';
import {
  currentRound,
  maskOf,
  remainingMs,
  totalPoints,
  type SoloEvent,
  type SoloGuess,
  type SoloResult,
  type SoloRunState,
} from './soloRun.js';

const OUTCOME_ICON = { guessed: Check, skipped: SkipForward, timeout: Clock } as const;

/** The word with what the last drawing brought, over the lower edge of the finished drawing. */
function Reveal({ result }: { result: SoloResult }) {
  const Icon = OUTCOME_ICON[result.outcome];
  const guessed = result.outcome === 'guessed';
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-4">
      <div
        data-testid="solo-reveal"
        data-outcome={result.outcome}
        data-points={result.points}
        role="status"
        className="flex max-w-full animate-overlay items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-2 shadow-lg sm:gap-4 sm:px-5 sm:py-3"
      >
        <span
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-full',
            guessed ? 'bg-success/15 text-success' : 'bg-surface-hover text-fg-secondary',
          )}
        >
          <Icon {...ICON} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-caption text-fg-secondary">
            {t(`solo.outcome.${result.outcome}`)}
          </span>
          <span
            data-testid="solo-reveal-word"
            className="font-display text-subheading break-words text-fg sm:text-heading"
          >
            {result.word}
          </span>
        </span>
        <span
          className={cx(
            'shrink-0 font-mono text-subheading tabular-nums',
            guessed ? 'animate-pop text-success' : 'text-fg-muted',
          )}
        >
          {t('turnEnd.delta', { points: result.points })}
        </span>
      </div>
    </div>
  );
}

/** One dot per drawing: done with points, done without, or still to come. */
function ProgressDots({ run }: { run: SoloRunState }) {
  return (
    <div aria-hidden className="hidden items-center gap-1.5 sm:flex">
      {run.rounds.map((round, index) => {
        const result = run.results[index];
        return (
          <span
            key={round.categoryId}
            className={cx(
              'size-2 rounded-full',
              result
                ? result.points > 0
                  ? 'bg-success'
                  : 'bg-fg-muted'
                : index === run.index
                  ? 'bg-accent ring-2 ring-accent/30'
                  : 'bg-line',
            )}
          />
        );
      })}
    </div>
  );
}

interface GuessPanelProps {
  guesses: readonly SoloGuess[];
  /** Guessing is paused while the word is revealed. */
  open: boolean;
  /** Changes with every drawing, to clear the input and take the focus. */
  drawing: number;
  onGuess: (text: string) => void;
}

/** The guess input and the list of guesses so far, in place of the chat (DESIGN §9, "Solo"). */
function GuessPanel({ guesses, open, drawing, onGuess }: GuessPanelProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText('');
    inputRef.current?.focus({ preventScroll: true });
  }, [drawing]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [guesses]);

  // The list shrinks to its latest line while the on-screen keyboard is open (spec 011).
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      list.scrollTop = list.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!open || text.trim().length === 0) return;
    onGuess(text);
    setText('');
  };

  return (
    <Panel
      aria-label={t('solo.guesses')}
      className="mx-2 flex min-h-44 flex-1 flex-col overflow-hidden typing:mx-1 typing:min-h-0 typing:flex-none sm:mx-0 sm:min-h-0"
    >
      <h2 className="hidden px-4 pt-3 pb-1 text-label text-fg-secondary sm:block">
        {t('solo.guesses')}
      </h2>
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={t('solo.guesses')}
        tabIndex={0}
        className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2 typing:max-h-7 typing:flex-none typing:overflow-hidden typing:py-0.5"
      >
        <ul className="flex min-h-full flex-col gap-0.5">
          {guesses.length === 0 ? (
            <li aria-hidden className="m-auto px-4 text-center text-caption text-fg-muted">
              {t('solo.noGuesses')}
            </li>
          ) : null}
          {guesses.map((guess, index) => (
            <li
              key={index}
              data-testid="solo-guess"
              data-close={guess.close}
              className={cx(
                'flex animate-enter items-start gap-2 rounded-sm px-2 py-1 text-label font-normal',
                guess.close ? 'bg-warning/10 text-warning' : 'text-fg',
              )}
            >
              {guess.close ? (
                <Sparkles size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
              ) : null}
              <span className="min-w-0 flex-1 break-words">{guess.text}</span>
              {guess.close ? (
                <span className="shrink-0 rounded-full border border-warning/50 px-2 text-caption">
                  {t('solo.close')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-line p-2 typing:p-1"
      >
        <input
          ref={inputRef}
          data-testid="solo-guess-input"
          aria-label={t('solo.guessLabel')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={!open}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={t('chat.guessPlaceholder')}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          className="min-h-11 min-w-0 flex-1 rounded-sm border border-accent bg-surface-overlay px-3 text-body text-fg transition-colors motion-fast read-only:border-line"
        />
        <IconButton
          type="submit"
          label={t('chat.send')}
          icon={<SendHorizontal {...ICON} />}
          disabled={!open || text.trim().length === 0}
          onMouseDown={(event) => event.preventDefault()}
        />
      </form>
      <SoloCredit className="hidden border-t border-line px-3 py-2 sm:block" />
    </Panel>
  );
}

interface SoloRunViewProps {
  run: SoloRunState;
  now: number;
  dispatch: (event: SoloEvent) => void;
  onLeave: () => void;
}

/** A solo run in progress: the replay, the mask and timer, the guesses (spec 009). */
export function SoloRunView({ run, now, dispatch, onLeave }: SoloRunViewProps) {
  const viewport = useVisibleViewport();
  const round = currentRound(run);
  if (!round) return null;
  const revealing = run.phase === 'reveal';
  const remaining = remainingMs(run, now);
  const progress = { index: run.index + 1, total: run.rounds.length };
  const lastResult = run.results[run.results.length - 1];

  return (
    <div
      data-testid="solo"
      data-phase={run.phase}
      data-viewport={viewport.typing ? 'typing' : 'full'}
      style={viewport.style}
      className="play-screen flex flex-col overflow-y-auto xl:overflow-hidden"
    >
      {viewport.typing ? (
        // The on-screen keyboard is open: one row, the canvas and the input (spec 011).
        <CompactPlayBar
          progress={
            <CompactProgress
              value={t('solo.progress', progress)}
              label={t('solo.progressLabel', progress)}
              testId="solo-progress"
              data={{ 'data-index': progress.index, 'data-total': progress.total }}
            />
          }
          word={
            revealing ? (
              <span className="font-mono text-subheading font-semibold break-words text-fg">
                {round.word}
              </span>
            ) : (
              <WordMask mask={maskOf(run)} />
            )
          }
          timer={
            <TimerRing
              seconds={secondsLeft(remaining)}
              fraction={remaining / SOLO.timePerDrawingMs}
              warn
              compact
            />
          }
        />
      ) : (
        <PlayTopBar
          progress={
            <ProgressIndicator
              caption={t('solo.drawing')}
              value={t('solo.progress', progress)}
              label={t('solo.progressLabel', progress)}
              testId="solo-progress"
              data={{ 'data-index': progress.index, 'data-total': progress.total }}
            />
          }
          word={
            <div className="flex min-w-0 flex-col items-center text-center">
              <span className="text-caption text-fg-muted uppercase">
                {revealing ? t('game.theWordWas') : t('game.guessThis')}
              </span>
              {revealing ? (
                <span className="font-mono text-subheading font-semibold break-words text-fg sm:text-heading">
                  {round.word}
                </span>
              ) : (
                <WordMask mask={maskOf(run)} />
              )}
            </div>
          }
          timer={
            <TimerRing
              seconds={secondsLeft(remaining)}
              fraction={remaining / SOLO.timePerDrawingMs}
              warn
            />
          }
          leaveLabel={t('solo.end')}
          onLeave={onLeave}
        />
      )}
      <main className="flex min-h-0 flex-1 flex-col gap-2 pb-2 typing:gap-1 typing:pb-1 sm:grid sm:grid-rows-[auto_minmax(13rem,1fr)] sm:gap-4 sm:p-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[minmax(0,1fr)]">
        <h1 className="sr-only">{t('solo.title')}</h1>
        <section className="stage stage-width flex min-w-0 flex-col items-center gap-1 justify-self-center sm:gap-3">
          <div className="stage-frame stage-fit relative shrink-0 overflow-hidden bg-paper shadow-lg ring-1 ring-line sm:rounded-lg">
            <SoloCanvas
              // A new drawing gets a new canvas, so nothing of the last one can show through.
              key={run.index}
              strokes={round.strokes}
              startedAt={run.phaseStartedAt}
              complete={revealing}
            />
            {revealing && lastResult ? <Reveal result={lastResult} /> : null}
          </div>
          <div className="flex min-h-11 w-full items-center justify-between gap-3 px-3 typing:hidden sm:px-0">
            <ProgressDots run={run} />
            <span className="flex items-baseline gap-2 text-caption text-fg-secondary">
              {t('solo.score')}
              <span
                data-testid="solo-score"
                className="font-mono text-body font-semibold text-fg tabular-nums"
              >
                {totalPoints(run)}
              </span>
            </span>
            <Button
              data-testid="solo-skip"
              icon={<SkipForward {...ICON} />}
              disabled={revealing}
              onClick={() => dispatch({ type: 'skip' })}
            >
              {t('solo.skip')}
            </Button>
          </div>
        </section>
        <GuessPanel
          guesses={run.guesses}
          open={!revealing}
          drawing={run.index}
          onGuess={(text) => dispatch({ type: 'guess', text })}
        />
      </main>
    </div>
  );
}
