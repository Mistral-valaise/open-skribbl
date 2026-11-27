import type { ReactNode } from 'react';
import { cx } from './cx.js';

interface CenteredPageProps {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** A single centred column, at most 480 px wide (DESIGN §9, "Home"). */
export function CenteredPage({ children, footer, className }: CenteredPageProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      <main className={cx('my-auto flex w-full max-w-120 flex-col gap-6', className)}>
        {children}
      </main>
      {footer ? <footer className="pt-8 text-caption text-fg-muted">{footer}</footer> : null}
    </div>
  );
}
