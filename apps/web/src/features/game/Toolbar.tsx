import { BRUSH_SIZES } from '@kritzel/shared';
import { Brush, Eraser, PaintBucket, Pipette, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { clearCanvas, isTypingTarget, redo, runShortcut, undo } from '../../canvas/drawActions.js';
import { PALETTE, PALETTE_BY_COLUMN } from '../../canvas/palette.js';
import { shortcutFor } from '../../canvas/shortcuts.js';
import { t } from '../../i18n/index.js';
import { useRoomStore } from '../../store/roomStore.js';
import { selectColor, selectSize, selectTool, useToolStore } from '../../store/toolStore.js';
import { cx } from '../../ui/cx.js';
import { IconButton, ICON } from '../../ui/IconButton.js';

/** Diameter of the dot on each size button, in CSS pixels. */
const SIZE_DOTS = [4, 7, 11, 16, 22] as const;

const GROUP = 'flex shrink-0 items-center gap-1';
const DIVIDER = 'h-8 w-px shrink-0 bg-line';

const SWATCH =
  'size-10 shrink-0 border border-line transition-[border-radius,transform] motion-fast sm:size-7';
/** Selection changes the shape and adds a ring, so it does not rely on colour (DESIGN §8). */
const SWATCH_SELECTED = 'rounded-full ring-2 ring-accent ring-offset-2 ring-offset-surface-raised';
const SWATCH_IDLE = 'rounded-sm hover:scale-110';

/**
 * The drawer's tools (spec 003). Rendered only for the drawer during the
 * drawing phase; the shortcuts live and die with it.
 */
export function Toolbar() {
  const tool = useToolStore((state) => state.tool);
  const color = useToolStore((state) => state.color);
  const size = useToolStore((state) => state.size);
  const canUndo = useRoomStore((state) => state.opLog.items.length > 0);
  const canRedo = useRoomStore((state) => state.opLog.redo.length > 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const shortcut = shortcutFor(event);
      if (!shortcut) return;
      event.preventDefault();
      runShortcut(shortcut);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isCustom = !PALETTE.includes(color);

  return (
    <div
      data-testid="toolbar"
      role="toolbar"
      aria-label={t('toolbar.label')}
      className={cx(
        'scroll-hidden flex w-full shrink-0 animate-enter items-center gap-2 overflow-x-auto px-3 py-1',
        'sm:flex-wrap sm:justify-center sm:gap-x-3 sm:overflow-visible sm:rounded-lg sm:border sm:border-line',
        'sm:bg-surface-raised sm:p-2 sm:shadow-sm',
      )}
    >
      <div className={GROUP}>
        <IconButton
          data-testid="tool-brush"
          label={t('toolbar.brush')}
          icon={<Brush {...ICON} />}
          pressed={tool === 'brush'}
          onClick={() => selectTool('brush')}
        />
        <IconButton
          data-testid="tool-eraser"
          label={t('toolbar.eraser')}
          icon={<Eraser {...ICON} />}
          pressed={tool === 'eraser'}
          onClick={() => selectTool('eraser')}
        />
        <IconButton
          data-testid="tool-fill"
          label={t('toolbar.fill')}
          icon={<PaintBucket {...ICON} />}
          pressed={tool === 'fill'}
          onClick={() => selectTool('fill')}
        />
      </div>

      <span aria-hidden className={DIVIDER} />

      <div role="group" aria-label={t('toolbar.sizes')} className={GROUP}>
        {BRUSH_SIZES.map((value, index) => (
          <IconButton
            key={value}
            data-testid={`size-${value}`}
            label={t('toolbar.size', { size: value, key: index + 1 })}
            pressed={size === value}
            onClick={() => selectSize(value)}
            icon={
              <span
                aria-hidden
                className="rounded-full bg-current"
                style={{ width: SIZE_DOTS[index], height: SIZE_DOTS[index] }}
              />
            }
          />
        ))}
      </div>

      <span aria-hidden className={DIVIDER} />

      <div className={cx(GROUP, 'sm:order-last')}>
        <IconButton
          data-testid="undo"
          label={t('toolbar.undo')}
          icon={<Undo2 {...ICON} />}
          disabled={!canUndo}
          onClick={undo}
        />
        <IconButton
          data-testid="redo"
          label={t('toolbar.redo')}
          icon={<Redo2 {...ICON} />}
          disabled={!canRedo}
          onClick={redo}
        />
        <IconButton
          data-testid="clear"
          label={t('toolbar.clear')}
          icon={<Trash2 {...ICON} />}
          tone="danger"
          disabled={!canUndo}
          onClick={clearCanvas}
        />
      </div>

      <span aria-hidden className={cx(DIVIDER, 'sm:order-last')} />

      <div
        role="group"
        aria-label={t('toolbar.colors')}
        className="flex shrink-0 items-center gap-2 py-1 sm:gap-1.5 sm:py-0"
      >
        <div className="grid shrink-0 grid-flow-col grid-rows-1 gap-1.5 sm:grid-rows-3 sm:gap-1">
          {PALETTE_BY_COLUMN.map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`color-${value.slice(1)}`}
              aria-label={t('toolbar.color', { color: value })}
              title={value}
              aria-pressed={color === value}
              onClick={() => selectColor(value)}
              className={cx(SWATCH, color === value ? SWATCH_SELECTED : SWATCH_IDLE)}
              style={{ backgroundColor: value }}
            />
          ))}
        </div>
        <label
          title={t('toolbar.customColor')}
          className={cx(
            SWATCH,
            'relative grid cursor-pointer place-items-center has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent sm:size-10',
            isCustom ? SWATCH_SELECTED : 'rounded-sm bg-surface-overlay hover:bg-surface-hover',
          )}
          style={isCustom ? { backgroundColor: color } : undefined}
        >
          <span className="grid size-6 place-items-center rounded-full bg-surface-raised text-fg-secondary">
            <Pipette size={14} strokeWidth={1.75} aria-hidden />
          </span>
          <input
            type="color"
            data-testid="color-custom"
            aria-label={t('toolbar.customColor')}
            value={color.toLowerCase()}
            onChange={(event) => selectColor(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
