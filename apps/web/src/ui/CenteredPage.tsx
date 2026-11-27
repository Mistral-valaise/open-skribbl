import type { ReactNode } from 'react';
import { CreatedBy } from './CreatedBy.js';
import { cx } from './cx.js';
import { ShellControls } from './ShellControls.js';

interface CenteredPageProps {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * A single centred column, at most 480 px wide, with language, theme and
 * sound controls in the top right corner (DESIGN §9, "Home"). Every such
 * page ends with the credit (spec 011).
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
      <footer className="flex flex-col items-center gap-1 pt-4 text-center text-caption text-fg-muted">
        {footer}
        <CreatedBy />
      </footer>
    </div>
  );
}
