# Roadmap

A milestone is done when every spec assigned to it is `Implemented`: all its acceptance criteria are covered by passing tests and `pnpm check` is green. Each milestone ends with one push.

| Milestone                 | Content                                                                                                                                 | Specs                   | Status  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------- |
| **M0** Foundation         | PRD, architecture, design guideline, feature specs, ADRs, glossary, agent instructions, workspace scaffold, CI                          | —                       | Done    |
| **M1** Core game          | Rooms and lobby, game loop, drawing, guessing and chat, scoring. English interface with a starter word list.                            | 001, 002, 003, 004, 005 | Done    |
| **M2** Full multiplayer   | Four interface languages and full word lists, custom words, reconnect, spectators, late join, reactions, likes, gallery, avatar builder | 006, 007, 008, 010      | Done    |
| **M3** Solo mode          | Dataset pipeline, replay engine, solo run, personal best                                                                                | 009                     | Planned |
| **M4** Polish and release | Themes, sound, responsive and touch polish, accessibility pass, Docker image, GHCR publishing, load test, hosting guides                | 011, 012                | Planned |

## After v1

| Item                                                       | Spec                                  | Notes                                                |
| ---------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Bots: the computer guesses drawings and joins normal rooms | [101](specs/roadmap/101-bots.md)      | Needs a sketch-recognition model that runs locally.  |
| Team mode                                                  | [102](specs/roadmap/102-team-mode.md) | Changes scoring and the scoreboard.                  |
| Gallery replay animation                                   | —                                     | Reuses the solo replay engine.                       |
| More interface and word languages                          | —                                     | Add a dictionary and three word lists; see spec 006. |

## Build order inside M1

Work from the inside out so every layer is testable before the next depends on it:

1. `packages/shared`: word matching, mask and hints, scoring, op log, game reducer, protocol schemas.
2. `apps/server`: room registry, room runtime, WebSocket gateway, integration tests.
3. `apps/web`: connection store, home, lobby, game screen, canvas.
4. End-to-end test: two browsers play a full game.
