import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.js';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside' | 'form';
  children: ReactNode;
}

/** A raised surface: defined by its border and surface colour first, shadow second (DESIGN §5). */
export function Panel({ as: Tag = 'section', className, children, ...rest }: PanelProps) {
  return (
    <Tag
      className={cx('rounded-lg border border-line bg-surface-raised shadow-sm', className)}
      {...(rest as HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Tag>
  );
}
