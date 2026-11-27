import { Redirect, Route, Switch } from 'wouter';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { SoloScreen } from '../features/solo/SoloScreen.js';
import { useLanguageStore } from '../i18n/index.js';
import { normalizeRoomCode } from '../store/roomCode.js';
import { Announcer } from '../ui/Announcer.js';
import { Toast } from '../ui/Toast.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { ReconnectingBanner } from './ReconnectingBanner.js';
import { RoomRoute } from './RoomRoute.js';

/** The routes of the app (docs/ARCHITECTURE.md §7): `/`, `/r/:code` and `/solo`. */
export function App() {
  // Subscribing here re-renders every screen when the interface language changes (spec 006).
  useLanguageStore((state) => state.language);
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={HomeScreen} />
        <Route path="/solo" component={SoloScreen} />
        <Route path="/r/:code">
          {({ code }) => {
            // Room codes are case-insensitive; the address bar shows the canonical form.
            const normalized = normalizeRoomCode(code);
            return normalized === code ? (
              <RoomRoute key={code} code={code} />
            ) : (
              <Redirect to={`/r/${normalized}`} replace />
            );
          }}
        </Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
      <ReconnectingBanner />
      <Toast />
      <Announcer />
    </ErrorBoundary>
  );
}
