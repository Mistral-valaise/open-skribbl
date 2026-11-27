import type { ReactNode } from 'react';
import { cx } from './cx.js';
import { ShellControls } from './ShellControls.js';

interface CenteredPageProps {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * A single centred column, at most 480 px wide, with language, theme and
 * sound controls in the top right corner (DESIGN §9, "Home").
 */
export function CenteredPage({ children, footer, className }: CenteredPageProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-4 pb-8 sm:pb-12">
      <header className="flex w-full justify-end">
        <ShellControls />
      </header>
      <main className={cx('my-auto flex w-full max-w-120 flex-col gap-6 py-6', className)}>
        {children}
      </main>
      {footer ? <footer className="pt-4 text-caption text-fg-muted">{footer}</footer> : null}
    </div>
  );
}
