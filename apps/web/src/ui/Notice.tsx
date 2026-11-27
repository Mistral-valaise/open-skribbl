import type { ReactNode } from 'react';
import { Panel } from './Panel.js';

interface NoticeProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  /** One action, or two at most (DESIGN §8, "Empty and error states"). */
  actions?: ReactNode;
  testId?: string;
}

/** A line of text and one action: the empty and error state of a whole screen. */
export function Notice({ icon, title, body, actions, testId }: NoticeProps) {
  return (
    <Panel data-testid={testId} className="flex flex-col items-center gap-4 p-6 text-center sm:p-8">
      {icon ? <div className="text-fg-muted">{icon}</div> : null}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-heading text-fg">{title}</h1>
        {body ? <p className="text-body text-fg-secondary">{body}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap justify-center gap-3 pt-2">{actions}</div> : null}
    </Panel>
  );
}
