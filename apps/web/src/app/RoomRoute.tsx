import type { Role } from '@kritzel/shared';
import { CircleSlash, CloudOff, SearchX, ServerCrash } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { lookUpRoom, type RoomLookup } from '../connection/api.js';
import { GameScreen } from '../features/game/GameScreen.js';
import { JoinForm } from '../features/home/JoinForm.js';
import { LobbyScreen } from '../features/lobby/LobbyScreen.js';
import { ResultsScreen } from '../features/results/ResultsScreen.js';
import { t } from '../i18n/index.js';
import { clearSession, loadNickname, loadSession } from '../store/identity.js';
import type { JoinFailure } from '../store/roomReducer.js';
import { useRoomStore } from '../store/roomStore.js';
import { clearAutoJoin, disconnect, hasAutoJoin, joinRoom, leaveRoom } from '../store/session.js';
import { Button, buttonClass } from '../ui/Button.js';
import { CenteredPage } from '../ui/CenteredPage.js';
import { Notice } from '../ui/Notice.js';
import { Spinner } from '../ui/Spinner.js';
import { Wordmark } from '../ui/Wordmark.js';

const NOTICE_ICON = { size: 32, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** Failures the visitor can fix on the join form; the others end on a notice. */
const RETRY_ON_FORM: readonly JoinFailure[] = ['room_full', 'invalid_nickname', 'invalid_avatar'];

function HomeLink() {
  return (
    <Link href="/" className={buttonClass()}>
      {t('room.backHome')}
    </Link>
  );
}

function StatusPage({ children }: { children: ReactNode }) {
  return (
    <CenteredPage>
      <div className="flex justify-center">
        <Link href="/" aria-label={t('room.backHome')} className="rounded-sm">
          <Wordmark size="sm" />
        </Link>
      </div>
      {children}
    </CenteredPage>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <StatusPage>
      <p className="flex items-center justify-center gap-3 text-body text-fg-secondary">
        <Spinner />
        {text}
      </p>
    </StatusPage>
  );
}

function RoomNotFound({ code }: { code: string }) {
  return (
    <StatusPage>
      <Notice
        testId="room-not-found"
        icon={<SearchX {...NOTICE_ICON} />}
        title={t('room.notFound.title')}
        body={t('room.notFound.body', { code })}
        actions={<HomeLink />}
      />
    </StatusPage>
  );
}

/**
 * `/r/:code`: looks the room up, lets the visitor join (or resumes their
 * seat), then shows the screen of the room's phase (spec 001, AC-001-16).
 */
export function RoomRoute({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const [lookup, setLookup] = useState<RoomLookup | 'checking'>('checking');
  const [lookupRun, setLookupRun] = useState(0);
  const status = useRoomStore((state) => state.status);
  const failure = useRoomStore((state) => state.failure);
  const view = useRoomStore((state) => state.view);

  useEffect(() => {
    const abort = new AbortController();
    setLookup('checking');
    void lookUpRoom(code, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLookup(result);
      if (result === 'missing') clearSession(code);
      if (result !== 'found') return;

      // A seat from before a reload is resumed; a room just created is joined right away.
      const stored = loadSession(code);
      if (stored || hasAutoJoin(code)) {
        clearAutoJoin();
        joinRoom({ code, nickname: loadNickname(), role: stored?.role ?? 'player' });
      }
    });
    return () => {
      abort.abort();
      disconnect();
    };
  }, [code, lookupRun]);

  const leave = () => {
    leaveRoom();
    navigate('/');
  };
  const join = (nickname: string, role: Role) => joinRoom({ code, nickname, role });

  if (lookup === 'checking') return <Loading text={t('room.checking')} />;
  if (lookup === 'missing' || failure === 'room_not_found') return <RoomNotFound code={code} />;
  if (lookup === 'unreachable') {
    return (
      <StatusPage>
        <Notice
          icon={<CloudOff {...NOTICE_ICON} />}
          title={t('room.unreachable.title')}
          body={t('room.unreachable.body')}
          actions={
            <>
              <Button variant="primary" onClick={() => setLookupRun((run) => run + 1)}>
                {t('room.retry')}
              </Button>
              <HomeLink />
            </>
          }
        />
      </StatusPage>
    );
  }

  if (failure && !RETRY_ON_FORM.includes(failure)) {
    return (
      <StatusPage>
        <Notice
          testId="room-failure"
          icon={
            failure === 'shutdown' ? (
              <ServerCrash {...NOTICE_ICON} />
            ) : (
              <CircleSlash {...NOTICE_ICON} />
            )
          }
          title={t(`failure.${failure}.title`)}
          body={t(`failure.${failure}.body`)}
          actions={
            <>
              {failure === 'version_mismatch' ? (
                <Button variant="primary" onClick={() => window.location.reload()}>
                  {t('room.reload')}
                </Button>
              ) : null}
              {failure === 'replaced' ? (
                <Button variant="primary" onClick={() => join(loadNickname(), 'player')}>
                  {t('room.rejoinHere')}
                </Button>
              ) : null}
              <HomeLink />
            </>
          }
        />
      </StatusPage>
    );
  }

  if (status === 'idle' || failure) {
    return (
      <JoinForm
        code={code}
        onJoin={join}
        error={
          failure
            ? { title: t(`failure.${failure}.title`), body: t(`failure.${failure}.body`) }
            : null
        }
      />
    );
  }

  if (!view) return <Loading text={t('room.joining')} />;

  switch (view.phase) {
    case 'lobby':
      return <LobbyScreen view={view} onLeave={leave} />;
    case 'gameEnd':
      return <ResultsScreen view={view} onLeave={leave} />;
    default:
      return <GameScreen view={view} onLeave={leave} />;
  }
}
