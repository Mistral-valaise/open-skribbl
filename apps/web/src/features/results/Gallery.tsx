import type { GalleryEntry, RankingEntry } from '@kritzel/shared';
import { Download, Heart, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DrawingThumbnail } from '../../canvas/DrawingThumbnail.js';
import { exportFileName } from '../../canvas/exportName.js';
import { exportPng, saveBlob } from '../../canvas/renderDrawing.js';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { send } from '../../store/session.js';
import { showToast } from '../../store/toastStore.js';
import { Avatar } from '../../ui/Avatar.js';
import { Button } from '../../ui/Button.js';
import { cx } from '../../ui/cx.js';
import { ICON } from '../../ui/IconButton.js';
import { Spinner } from '../../ui/Spinner.js';

const COUNT = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** True once the element has come close to the viewport; it then stays true. */
function useSeen<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);

  return [ref, seen] as const;
}

interface GalleryCardProps {
  entry: GalleryEntry;
  drawer: RankingEntry | undefined;
  favorite: boolean;
}

function GalleryCard({ entry, drawer, favorite }: GalleryCardProps) {
  const avatar = entry.drawerAvatar ?? drawer?.avatar;
  const items = useRoomStore((state) => state.gallery[entry.turnIndex]);
  const connected = useRoomStore((state) => state.status === 'joined');
  const [ref, seen] = useSeen<HTMLLIElement>();
  const [saving, setSaving] = useState(false);

  // Drawings are fetched when their card comes into view, and again after a reconnect.
  useEffect(() => {
    if (seen && connected && !items) send({ type: 'gallery.get', turnIndex: entry.turnIndex });
  }, [seen, connected, items, entry.turnIndex]);

  const download = async () => {
    if (!items) return;
    setSaving(true);
    try {
      saveBlob(await exportPng(items), exportFileName(entry.word, entry.drawerName));
    } catch {
      showToast('results.downloadFailed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li
      ref={ref}
      data-testid="gallery-item"
      data-turn-index={entry.turnIndex}
      data-favorite={favorite}
      data-loaded={items !== undefined}
      className={cx(
        'flex flex-col overflow-hidden rounded-lg border bg-surface-raised shadow-sm',
        favorite ? 'border-warning' : 'border-line',
      )}
    >
      <div className="relative aspect-[4/3] bg-paper">
        {items ? (
          <DrawingThumbnail
            items={items}
            testId="gallery-drawing"
            className="w-full"
            label={t('results.drawingAlt', { word: entry.word, name: entry.drawerName })}
          />
        ) : (
          <div
            role="status"
            aria-label={t('results.drawingLoading')}
            className="absolute inset-0 grid place-items-center text-ink/60"
          >
            <Spinner />
          </div>
        )}
        {favorite ? (
          <span
            data-testid="gallery-favorite"
            className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full border border-warning bg-surface-raised px-2.5 py-1 text-caption text-warning shadow-sm"
          >
            <Heart size={14} strokeWidth={2} aria-hidden />
            {t('results.favorite')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border-t border-line p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <span data-testid="gallery-word" className="min-w-0 text-subheading break-words text-fg">
            {entry.word}
          </span>
          <span
            data-testid="gallery-likes"
            data-up={entry.likesUp}
            data-down={entry.likesDown}
            className="flex shrink-0 items-center gap-3 pt-1 font-mono text-label text-fg-secondary tabular-nums"
          >
            <span
              className="flex items-center gap-1"
              title={t('like.upCount', { count: entry.likesUp })}
            >
              <ThumbsUp {...COUNT} />
              <span aria-hidden>{entry.likesUp}</span>
              <span className="sr-only">{t('like.upCount', { count: entry.likesUp })}</span>
            </span>
            <span
              className="flex items-center gap-1"
              title={t('like.downCount', { count: entry.likesDown })}
            >
              <ThumbsDown {...COUNT} />
              <span aria-hidden>{entry.likesDown}</span>
              <span className="sr-only">{t('like.downCount', { count: entry.likesDown })}</span>
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-label font-normal text-fg-secondary">
            {avatar ? <Avatar avatar={avatar} name={entry.drawerName} size={28} /> : null}
            <span data-testid="gallery-drawer" className="truncate">
              {t('results.drawnBy', { name: entry.drawerName })}
            </span>
          </span>
          <Button
            data-testid="gallery-download"
            aria-label={t('results.downloadLabel', { word: entry.word })}
            icon={<Download {...ICON} />}
            disabled={!items}
            busy={saving}
            onClick={download}
          >
            {t('results.download')}
          </Button>
        </div>
        <p className="text-caption text-fg-muted">
          {t('results.round', { round: entry.round })}
          {' · '}
          {t('results.guessedBy', { guessed: entry.guessedCount, guessers: entry.guesserCount })}
        </p>
      </div>
    </li>
  );
}

interface GalleryProps {
  entries: readonly GalleryEntry[];
  favorite: number | null;
  ranking: readonly RankingEntry[];
}

/** Every drawing of the game with its word, drawer and likes (spec 008). */
export function Gallery({ entries, favorite, ranking }: GalleryProps) {
  if (entries.length === 0) {
    return <p className="text-center text-label text-fg-secondary">{t('results.galleryEmpty')}</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <GalleryCard
          key={entry.turnIndex}
          entry={entry}
          drawer={ranking.find((player) => player.id === entry.drawerId)}
          favorite={entry.turnIndex === favorite}
        />
      ))}
    </ul>
  );
}
