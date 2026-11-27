import { Bug } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { t } from '../i18n/index.js';
import { Button } from '../ui/Button.js';
import { Notice } from '../ui/Notice.js';

/**
 * A JavaScript error in a screen shows a panel with a reload action instead
 * of a blank page (spec 011, "Feedback states").
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-120">
          <Notice
            testId="error-panel"
            icon={<Bug size={32} strokeWidth={1.5} aria-hidden />}
            title={t('crash.title')}
            body={t('crash.body')}
            actions={
              <Button
                variant="primary"
                data-testid="error-reload"
                onClick={() => window.location.reload()}
              >
                {t('room.reload')}
              </Button>
            }
          />
        </div>
      </div>
    );
  }
}
