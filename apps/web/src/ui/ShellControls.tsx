import { Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { setMuted, useSoundStore } from '../audio/index.js';
import { t } from '../i18n/index.js';
import { otherTheme, setTheme, useThemeStore } from '../theme/theme.js';
import { cx } from './cx.js';
import { IconButton, ICON } from './IconButton.js';
import { LanguageSwitch } from './LanguageSwitch.js';
import { MeasurementsControl } from './MeasurementsControl.js';

/** Switches between the dark and the light theme; its name says where it leads (spec 011). */
export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const target = otherTheme(theme);
  return (
    <IconButton
      data-testid="theme-toggle"
      data-theme-target={target}
      label={t(target === 'light' ? 'theme.toLight' : 'theme.toDark')}
      icon={target === 'light' ? <Sun {...ICON} /> : <Moon {...ICON} />}
      onClick={() => setTheme(target)}
    />
  );
}

/** The one mute switch for all sound effects (spec 011, DESIGN §7). */
export function MuteToggle() {
  const muted = useSoundStore((state) => state.muted);
  return (
    <IconButton
      data-testid="mute-toggle"
      label={t('sound.mute')}
      icon={muted ? <VolumeX {...ICON} /> : <Volume2 {...ICON} />}
      pressed={muted}
      onClick={() => setMuted(!muted)}
    />
  );
}

/**
 * Language, theme and sound: the controls every screen offers. Where the
 * server offers browser measurements, their control joins them (spec 015).
 */
export function ShellControls({ className }: { className?: string }) {
  return (
    <div className={cx('flex shrink-0 items-center gap-1', className)}>
      <LanguageSwitch className="mr-1" />
      <ThemeToggle />
      <MuteToggle />
      <MeasurementsControl />
    </div>
  );
}
