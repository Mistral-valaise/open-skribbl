# Kritzel — Product Requirements Document

|            |                                 |
| ---------- | ------------------------------- |
| Status     | Approved; version 1 implemented |
| Version    | 1.0 scope                       |
| Vocabulary | [`CONTEXT.md`](../CONTEXT.md)   |

## 1. Summary

Kritzel is an open-source, self-hosted draw-and-guess party game. One player draws a secret word, everyone else races to guess it in chat. A team runs it with one Docker command and plays in private rooms: no ads, no accounts, no tracking, no third-party requests.

Kritzel is an original game in the draw-and-guess genre with its own name, visual identity, word lists and code.

## 2. Problem

Teams use public draw-and-guess sites for remote socials and warm-ups. Those sites wrap the game in advertising, load third-party trackers, look dated, and offer nothing when you want to play alone. A team cannot host them, brand them, or trust them on a company network.

## 3. Goals and non-goals

### Goals

- **G1 Ad-free and private.** The app makes zero requests to hosts other than its own origin and stores nothing about players on the server beyond the life of a room.
- **G2 One-command hosting.** `docker run` gives a working instance; no database, no external service, no configuration required.
- **G3 A better game.** Everything a team expects from the genre, plus quality-of-life features that public sites lack (see §6).
- **G4 Modern and professional.** A polished, consistent interface in light and dark themes that works on desktop, tablet and phone.
- **G5 Four languages.** Interface and word lists in English, German, Spanish and French.
- **G6 Playable alone.** A solo mode against the computer with no API key and no running costs.
- **G7 Agent-ready repository.** Specs with testable acceptance criteria are the source of truth, so coding agents and humans can extend the game predictably.

### Non-goals (v1)

- Public rooms, matchmaking, or playing with strangers.
- Accounts, profiles, friends, persistent statistics.
- Server-side persistence of any kind; horizontal scaling across instances.
- Content moderation, profanity filters, reporting.
- Image uploads.
- Shape tools (line, rectangle, ellipse).
- Native mobile apps.

## 4. Users and scenarios

| Persona                        | Scenario                                                     | What they need                                                                                                  |
| ------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Team organiser**             | Starts a 20-minute game at the end of a remote team meeting. | Create a room in seconds, share one link, sensible defaults, host controls.                                     |
| **Teammate**                   | Clicks the link in the team chat.                            | Join with a nickname only; understand the screen at a glance; reconnect without losing points when Wi-Fi drops. |
| **Self-hoster**                | Runs Kritzel on the company's server or a small VPS.         | One container, no state, clear reverse-proxy docs, health check, no outbound traffic.                           |
| **Solo player**                | Has five minutes between meetings.                           | Start instantly, no other people required, personal best to beat.                                               |
| **Contributor / coding agent** | Adds a feature or a language.                                | Specs, a glossary, a predictable layout and commands, tests tied to acceptance criteria.                        |

## 5. Product principles

1. **Private by construction.** If a feature needs a third-party request, an account or stored personal data, it does not ship.
2. **Zero-friction entry.** From link to playing in under ten seconds: nickname, optional avatar, go.
3. **The server decides.** Every rule (timing, scoring, who sees the word) is enforced on the server; clients only render.
4. **Fun over features.** The canvas and the chat are the product. Chrome stays quiet until it is needed.
5. **Spec first.** Behaviour changes start as a spec change; code follows.

## 6. Scope

Each feature is specified in `docs/specs/`. Milestones are defined in [`ROADMAP.md`](ROADMAP.md).

### Version 1

| #   | Feature                                                                      | Spec                                          | Milestone |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| F1  | Private rooms with room code and invite link, lobby, host controls, settings | [001](specs/001-rooms-and-lobby.md)           | M1        |
| F2  | Game loop: rounds, turns, word choice, timers                                | [002](specs/002-game-loop.md)                 | M1        |
| F3  | Drawing canvas: brush, eraser, fill, undo/redo, clear, live sync             | [003](specs/003-drawing.md)                   | M1        |
| F4  | Guessing and chat: tolerant matching, close-guess notice, guessed channel    | [004](specs/004-guessing-and-chat.md)         | M1        |
| F5  | Scoring and ranking                                                          | [005](specs/005-scoring.md)                   | M1        |
| F6  | Words and languages: EN/DE/ES/FR interface, word lists, custom words, hints  | [006](specs/006-words-and-languages.md)       | M2        |
| F7  | Presence: reconnect, spectators, late join, host migration                   | [007](specs/007-presence-and-resilience.md)   | M2        |
| F8  | Reactions, likes, results with podium and gallery, PNG download              | [008](specs/008-reactions-and-gallery.md)     | M2        |
| F9  | Identity: nickname and avatar builder                                        | [010](specs/010-identity-and-avatars.md)      | M2        |
| F10 | Solo mode, stage 1: the computer draws, the player guesses                   | [009](specs/009-solo-mode.md)                 | M3        |
| F11 | App shell: themes, sound, responsive layout, accessibility                   | [011](specs/011-app-shell.md)                 | M4        |
| F12 | Deployment and operations: Docker image, health check, CI, GHCR              | [012](specs/012-deployment-and-operations.md) | M4        |

### After version 1 (specified as drafts)

| Feature                                                                          | Spec                                  |
| -------------------------------------------------------------------------------- | ------------------------------------- |
| Solo mode, stage 2: bots that guess the player's drawing and sit in normal rooms | [101](specs/roadmap/101-bots.md)      |
| Team mode: two teams play against each other                                     | [102](specs/roadmap/102-team-mode.md) |

## 7. Non-functional requirements

| ID                    | Requirement                                                                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 Privacy         | The browser contacts only the Kritzel origin. Fonts, icons and sounds are bundled. No cookies; browser storage holds only the player's own preferences. No analytics of players: operator telemetry is off by default and carries no player data, and browser measurements need the operator's switch and the player's own (spec 015). |
| NFR-2 Statelessness   | All room state lives in server memory and disappears when the room closes or the process restarts.                                                                                                                                                                                                                                     |
| NFR-3 Latency         | A stroke segment appears for other participants within 150 ms on a connection with 50 ms round-trip time.                                                                                                                                                                                                                              |
| NFR-4 Capacity        | One instance with 1 vCPU and 512 MB RAM serves 30 concurrent rooms of 8 players. Verified by a scripted load test in M4.                                                                                                                                                                                                               |
| NFR-5 Robustness      | A malformed or hostile message from one client never crashes the server or corrupts another room. All inbound messages are schema-validated and rate-limited.                                                                                                                                                                          |
| NFR-6 Accessibility   | Everything except freehand drawing is keyboard operable. Text meets WCAG 2.1 AA contrast. Status is never conveyed by colour alone. Reduced-motion preference is respected.                                                                                                                                                            |
| NFR-7 Browser support | Current and previous major versions of Chrome, Edge, Firefox and Safari, including iOS Safari and Android Chrome.                                                                                                                                                                                                                      |
| NFR-8 Operability     | Single container, non-root, configured only by environment variables, with a health endpoint and structured logs.                                                                                                                                                                                                                      |
| NFR-9 Quality         | Every acceptance criterion of an implemented spec is referenced by at least one automated test (`pnpm spec:coverage`). CI runs lint, type check, unit, integration and end-to-end tests.                                                                                                                                               |
| NFR-10 Licensing      | MIT for code. Third-party content carries its licence and attribution in `NOTICE.md`.                                                                                                                                                                                                                                                  |

## 8. Success criteria for v1

- A new user creates a room and a second user joins by link and both complete a full game, on desktop and on a phone, in each of the four languages.
- A fresh machine goes from `docker run` to a playable game with no further steps.
- A browser network log of a full game shows same-origin requests only.
- A solo run is playable start to finish with the server unreachable after page load.
- All v1 specs are `Implemented`; `pnpm spec:coverage` reports 100 % for them.

## 9. Risks

| Risk                                                                    | Mitigation                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fill results differ slightly between browsers because of anti-aliasing. | Tolerance-based fill on a fixed logical canvas; see [ADR 0002](adr/0002-drawing-as-op-log.md).                |
| Translated solo categories produce awkward or ambiguous words.          | Human-readable mapping file in the repo; ambiguous categories are excluded from the solo set.                 |
| Process restart ends all running games.                                 | Accepted for v1 ([ADR 0001](adr/0001-single-process-in-memory-state.md)); graceful shutdown notifies players. |
| Word-list quality varies by language.                                   | Lists are plain text with validation tests and contribution guidelines.                                       |

## 10. Decision log

Decisions taken with the project owner before the specs were written.

| Topic        | Decision                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name         | Kritzel. Original identity, word lists and design.                                                                                                  |
| Rooms        | Private only, by room code or link. 2–12 players, default 8.                                                                                        |
| Identity     | Nickname and avatar builder. No accounts, no database, no tracking.                                                                                 |
| Hosting      | Single Docker image; guides for common platforms.                                                                                                   |
| Stack        | TypeScript monorepo (pnpm): React + Vite + Tailwind web app, Node WebSocket server, shared rules package.                                           |
| Specs        | `docs/` in English; MIT licence.                                                                                                                    |
| Rules        | 3 rounds, 80 s, 3 word choices, hints, time-based points; all host-configurable.                                                                    |
| Extras in v1 | Close-guess notice, reactions and likes, gallery with PNG download, custom words, reconnect, spectators and late join, guessed channel.             |
| Tools        | Brush (5 sizes), 24-colour palette plus picker, eraser, fill, undo/redo, clear, shortcuts. No shape tools.                                          |
| Words        | Own lists per language in three difficulties; tolerant comparison of accents, umlauts and case.                                                     |
| Design       | "Studio" direction: dark by default, strong accent, calm typography, playful accents; light theme included. Fully responsive with touch and stylus. |
| Solo         | v1: dedicated screen, ten drawings replayed from an open dataset, personal best. Bots and computer guessing are roadmap.                            |
| Avatars      | Built from bundled SVG parts. No uploads.                                                                                                           |
| Quality      | Rules as pure tested functions, WebSocket integration tests, two-browser end-to-end test, CI, acceptance criteria linked to tests.                  |
| Publishing   | Push to GitHub; CI publishes the image to GHCR from `main` and version tags. Roadmap lives in `docs/ROADMAP.md`.                                    |
| Languages    | English, German, Spanish and, added by the owner during M1, French: interface, word lists and solo labels.                                          |
| Telemetry    | Added by the owner for M6: opt-in OpenTelemetry for operators and opt-in browser measurements, neither carrying player data (spec 015, ADR 0006).   |
