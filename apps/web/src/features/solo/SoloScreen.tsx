import { LANGUAGES, SOLO, type Language } from '@kritzel/shared';
import { CloudOff, Play } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { playSound } from '../../audio/index.js';
import { t, useLanguageStore } from '../../i18n/index.js';
import { announce } from '../../ui/Announcer.js';
import { Button, buttonClass } from '../../ui/Button.js';
import { CenteredPage } from '../../ui/CenteredPage.js';
import { SelectField } from '../../ui/Field.js';
import { ICON } from '../../ui/IconButton.js';
import { Notice } from '../../ui/Notice.js';
import { Panel } from '../../ui/Panel.js';
import { Wordmark } from '../../ui/Wordmark.js';
import { loadBests, recordRun, saveBests, type SoloBests } from './soloBest.js';
import { loadCategories, loadDrawings } from './soloContent.js';
import { SoloCredit } from './SoloCredit.js';
import { buildRounds, pickCategories, totalPoints, type SoloRound } from './soloRun.js';
import { SoloRunView } from './SoloRunView.js';
import { SoloSummary } from './SoloSummary.js';
import { useSoloRun } from './useSoloRun.js';

function readBests(): SoloBests {
  try {
    return loadBests(window.localStorage);
  } catch {
    return {};
  }
}

/**
 * Fetches everything a run needs before its first drawing starts, so a
 * started run finishes without the network (spec 009, "Offline behaviour").
 */
async function prepareRun(language: Language): Promise<SoloRound[]> {
  const picked = pickCategories(await loadCategories(), language, Math.random);
  if (picked.length === 0) throw new Error('solo content: nothing to play');
  const files = await Promise.all(picked.map((category) => loadDrawings(category.file)));
  const drawings = new Map(picked.map((category, index) => [category.file, files[index]!]));
  return buildRounds(picked, language, (file) => drawings.get(file) ?? [], Math.random);
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div data-testid="solo" data-phase="start">
      <CenteredPage footer={<SoloCredit className="text-center" />}>
        <header className="flex flex-col items-center gap-6 text-center">
          <Link href="/" className="rounded-sm">
            <Wordmark size="sm" />
            <span className="sr-only">{t('room.backHome')}</span>
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-title text-fg">{t('solo.title')}</h1>
            <p className="text-body text-fg-secondary">
              {t('solo.intro', {
                count: SOLO.drawingsPerRun,
                seconds: SOLO.timePerDrawingMs / 1000,
              })}
            </p>
          </div>
        </header>
        {children}
      </CenteredPage>
    </div>
  );
}

interface RunProps {
  language: Language;
  rounds: readonly SoloRound[];
  onPlayAgain: () => void;
  onLeave: () => void;
}

/** One run from its first drawing to the summary. */
function Run({ language, rounds, onPlayAgain, onLeave }: RunProps) {
  const { run, now, dispatch } = useSoloRun(language, rounds);
  const [outcome, setOutcome] = useState<{ bests: SoloBests; isNewBest: boolean } | null>(null);
  const recorded = useRef(false);

  const finished = run.phase === 'summary';
  const results = run.results.length;
  const lastOutcome = run.results[results - 1]?.outcome;
  const lastWord = run.results[results - 1]?.word;

  // The personal best is stored once per run (spec 009, "Personal best").
  useEffect(() => {
    if (!finished || recorded.current) return;
    recorded.current = true;
    const next = recordRun(readBests(), language, totalPoints(run), new Date().toISOString());
    try {
      saveBests(window.localStorage, next.bests);
    } catch {
      // Without storage the best lasts for this visit only.
    }
    setOutcome(next);
    if (next.isNewBest) playSound('win');
  }, [finished, language, run]);

  // What a sighted player sees is also heard: the result of each drawing, then the next one.
  useEffect(() => {
    if (lastOutcome === undefined || lastWord === undefined) return;
    playSound(lastOutcome === 'guessed' ? 'correctSelf' : 'turnEnd');
    announce(`${t(`solo.outcome.${lastOutcome}`)}. ${t('system.turn_ended', { word: lastWord })}`);
  }, [results, lastOutcome, lastWord]);

  useEffect(() => {
    if (run.phase === 'drawing') {
      announce(t('solo.progressLabel', { index: run.index + 1, total: run.rounds.length }));
    }
  }, [run.phase, run.index, run.rounds.length]);

  if (finished) {
    return (
      <SoloSummary
        run={run}
        record={outcome?.bests[language]}
        isNewBest={outcome?.isNewBest ?? false}
        onPlayAgain={onPlayAgain}
        onLeave={onLeave}
      />
    );
  }
  return <SoloRunView run={run} now={now} dispatch={dispatch} onLeave={onLeave} />;
}

type Stage =
  | { name: 'start' }
  | { name: 'loading' }
  | { name: 'error' }
  | { name: 'run'; id: number; rounds: readonly SoloRound[] };

/** `/solo`: the computer draws, the player guesses; no nickname and no room (spec 009). */
export function SoloScreen() {
  const [, navigate] = useLocation();
  const [language, setLanguage] = useState<Language>(() => useLanguageStore.getState().language);
  const [stage, setStage] = useState<Stage>({ name: 'start' });
  const [bests] = useState(readBests);
  const mounted = useRef(true);
  const runs = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const begin = () => {
    setStage({ name: 'loading' });
    prepareRun(language).then(
      (rounds) => {
        runs.current += 1;
        if (mounted.current) setStage({ name: 'run', id: runs.current, rounds });
      },
      () => {
        if (mounted.current) setStage({ name: 'error' });
      },
    );
  };

  if (stage.name === 'run') {
    return (
      <Run
        key={stage.id}
        language={language}
        rounds={stage.rounds}
        onPlayAgain={begin}
        onLeave={() => navigate('/')}
      />
    );
  }

  if (stage.name === 'error') {
    return (
      <Shell>
        <Notice
          testId="solo-error"
          icon={<CloudOff size={32} strokeWidth={1.5} aria-hidden />}
          title={t('solo.error.title')}
          body={t('solo.error.body')}
          actions={
            <>
              <Button variant="primary" data-testid="solo-retry" onClick={begin}>
                {t('room.retry')}
              </Button>
              <Link href="/" className={buttonClass()}>
                {t('room.backHome')}
              </Link>
            </>
          }
        />
      </Shell>
    );
  }

  const best = bests[language]?.best;
  const recent = bests[language]?.recent ?? [];
  // Dates in the interface language (DESIGN §11).
  const dateFormat = new Intl.DateTimeFormat(useLanguageStore.getState().language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <Shell>
      <Panel as="div" className="flex flex-col gap-4 p-4 sm:p-6">
        <SelectField
          label={t('solo.language')}
          data-testid="solo-language"
          name="language"
          value={language}
          disabled={stage.name === 'loading'}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const chosen = LANGUAGES.find((value) => value === event.target.value);
            if (chosen) setLanguage(chosen);
          }}
        >
          {LANGUAGES.map((value) => (
            <option key={value} value={value} lang={value}>
              {t(`language.${value}`)}
            </option>
          ))}
        </SelectField>
        <div className="flex items-center justify-between gap-4">
          <span className="text-label text-fg-secondary">{t('solo.best')}</span>
          <span
            data-testid="solo-best"
            data-best={best ?? 0}
            className={
              best === undefined
                ? 'text-label font-normal text-fg-muted'
                : 'font-mono text-subheading text-fg tabular-nums'
            }
          >
            {best ?? t('solo.bestNone')}
          </span>
        </div>
        {recent.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <span className="text-caption text-fg-muted">{t('solo.recent')}</span>
            <ul data-testid="solo-recent" className="flex flex-col gap-0.5">
              {recent.map((entry) => (
                <li
                  key={entry.date}
                  className="flex items-baseline justify-between gap-4 text-label font-normal text-fg-secondary"
                >
                  <time dateTime={entry.date}>{dateFormat.format(new Date(entry.date))}</time>
                  <span className="font-mono text-fg tabular-nums">{entry.total}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
      <Button
        variant="primary"
        size="lg"
        block
        busy={stage.name === 'loading'}
        icon={<Play {...ICON} />}
        onClick={begin}
        data-testid="solo-start"
      >
        {stage.name === 'loading' ? t('solo.loading') : t('solo.start')}
      </Button>
    </Shell>
  );
}
