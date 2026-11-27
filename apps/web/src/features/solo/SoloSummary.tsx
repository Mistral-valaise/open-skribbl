import { planReplay, replayAt, type Language } from '@kritzel/shared';
import { RotateCcw, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { DrawingThumbnail } from '../../canvas/DrawingThumbnail.js';
import { t } from '../../i18n/index.js';
import { Button } from '../../ui/Button.js';
import { cx } from '../../ui/cx.js';
import { ICON } from '../../ui/IconButton.js';
import { RoomHeader } from '../../ui/RoomHeader.js';
import type { SoloRecord } from './soloBest.js';
import { SoloCredit } from './SoloCredit.js';
import { totalPoints, type SoloResult, type SoloRound, type SoloRunState } from './soloRun.js';

function SummaryRow({ round, result }: { round: SoloRound; result: SoloResult }) {
  // The finished drawing: the replay at its end.
  const items = useMemo(() => {
    const plan = planReplay(round.strokes);
    return replayAt(plan, plan.durationMs);
  }, [round.strokes]);
  const scored = result.points > 0;
  return (
    <li
      data-testid="solo-summary-row"
      data-points={result.points}
      data-outcome={result.outcome}
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm"
    >
      <DrawingThumbnail
        items={items}
        label={t('turnEnd.drawing')}
        className="w-full border-b border-line"
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-label break-words text-fg">{result.word}</span>
          <span className="text-caption text-fg-muted">{t(`solo.outcome.${result.outcome}`)}</span>
        </span>
        <span
          className={cx(
            'shrink-0 font-mono text-label font-semibold tabular-nums',
            scored ? 'text-success' : 'text-fg-muted',
          )}
        >
          {t('turnEnd.delta', { points: result.points })}
        </span>
      </div>
    </li>
  );
}

interface SoloSummaryProps {
  run: SoloRunState;
  /** The stored record of the run's language, this run included. */
  record: SoloRecord | undefined;
  isNewBest: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}

/** After ten drawings: total, personal best and the drawings with their words (spec 009). */
export function SoloSummary({ run, record, isNewBest, onPlayAgain, onLeave }: SoloSummaryProps) {
  const total = totalPoints(run);
  const language: Language = run.language;
  return (
    <div
      data-testid="solo"
      data-phase="summary"
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 p-4 sm:p-6"
    >
      <RoomHeader onLeave={onLeave} />
      <main data-testid="solo-summary" className="flex flex-col gap-6 pb-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-title text-fg">{t('solo.summary.title')}</h1>
          <div className="flex flex-wrap items-stretch justify-center gap-3">
            <div className="flex min-w-36 flex-col items-center rounded-lg border border-line bg-surface-raised px-6 py-3">
              <span className="text-caption text-fg-secondary uppercase">{t('solo.total')}</span>
              <span
                data-testid="solo-total"
                data-total={total}
                className="font-display text-display text-fg tabular-nums"
              >
                {total}
              </span>
            </div>
            <div
              className={cx(
                'flex min-w-36 flex-col items-center rounded-lg border bg-surface-raised px-6 py-3',
                isNewBest ? 'border-warning' : 'border-line',
              )}
            >
              <span className="text-caption text-fg-secondary uppercase">
                {t('solo.best')} · <span lang={language}>{t(`language.${language}`)}</span>
              </span>
              <span
                data-testid="solo-best"
                data-best={record?.best ?? 0}
                data-new-best={isNewBest}
                className="font-display text-display text-fg tabular-nums"
              >
                {record?.best ?? 0}
              </span>
              {isNewBest ? (
                <span
                  data-testid="solo-new-best"
                  className="flex animate-pop items-center gap-1.5 text-caption text-warning"
                >
                  <Trophy size={14} strokeWidth={2} aria-hidden />
                  {t('solo.newBest')}
                </span>
              ) : null}
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="mt-1 w-full sm:w-auto sm:min-w-56"
            icon={<RotateCcw {...ICON} />}
            onClick={onPlayAgain}
            data-testid="solo-play-again"
          >
            {t('solo.playAgain')}
          </Button>
        </div>

        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {run.results.map((result, index) => (
            <SummaryRow key={index} round={run.rounds[index]!} result={result} />
          ))}
        </ol>

        <SoloCredit className="text-center" />
      </main>
    </div>
  );
}
