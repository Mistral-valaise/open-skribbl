import { Redirect, Route, Switch } from 'wouter';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { normalizeRoomCode } from '../store/roomCode.js';
import { Toast } from '../ui/Toast.js';
import { ReconnectingBanner } from './ReconnectingBanner.js';
import { RoomRoute } from './RoomRoute.js';

/** The routes of the app (docs/ARCHITECTURE.md §7): `/` and `/r/:code`. */
export function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={HomeScreen} />
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
    </>
  );
}
