# Kritzel

**Draw. Guess. No ads.** Kritzel is an open-source draw-and-guess party game you host yourself and play with your team: private rooms, no accounts, no tracking, no third-party requests. English, German, Spanish and French, with a solo mode against the computer.

> **Status: milestone M0 (foundation).** The specifications and the workspace are in place; the game itself is built in milestones M1–M4. See the [roadmap](docs/ROADMAP.md).

🇩🇪 Kritzel ist ein quelloffenes Zeichnen-und-Raten-Spiel zum Selbsthosten: private Räume fürs Team, ohne Werbung, ohne Konten, ohne Tracking. Auf Deutsch, Englisch, Spanisch und Französisch, mit Solo-Modus gegen den Computer.

🇪🇸 Kritzel es un juego de dibujar y adivinar de código abierto que alojas tú mismo: salas privadas para tu equipo, sin anuncios, sin cuentas y sin rastreo. En español, inglés, alemán y francés, con modo en solitario contra el ordenador.

🇫🇷 Kritzel est un jeu de dessin et de devinettes open source à héberger soi-même : des salons privés pour ton équipe, sans publicité, sans compte et sans pistage. En français, anglais, allemand et espagnol, avec un mode solo contre l'ordinateur.

## What you get in v1

- Private rooms by link or six-character code, 2–12 players plus spectators
- Brush, eraser, fill, undo and redo, on mouse, touch and stylus
- Tolerant guessing (accents, umlauts, spacing), close-guess notices, a separate chat for those who already guessed
- Host settings: rounds, draw time, word choices, hints, difficulty, custom words
- Reconnect without losing points, late join, host migration
- Reactions, likes, results with podium and a gallery of all drawings with PNG download
- Solo mode: the computer draws, you guess, beat your personal best
- Light and dark theme, phone to desktop, keyboard and screen-reader support
- One Docker image, no database, no configuration required

## Repository map

```
apps/web          React client (Vite)
apps/server       Node server (HTTP + WebSocket)
packages/shared   Game rules, protocol and drawing model as pure TypeScript
docs/             Product, architecture and design documents, specs, decisions
scripts/          Repository tooling
```

## Documentation

| Document                                       | Content                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| [Product requirements](docs/PRD.md)            | Goals, non-goals, scope, quality requirements, decision log |
| [Architecture guideline](docs/ARCHITECTURE.md) | Modules, protocol, drawing pipeline, testing, deployment    |
| [Design guideline](docs/DESIGN.md)             | Brand, tokens, components, screens, accessibility           |
| [Specs](docs/specs/README.md)                  | One spec per feature with numbered acceptance criteria      |
| [Roadmap](docs/ROADMAP.md)                     | Milestones and what comes after v1                          |
| [Decisions](docs/adr/)                         | Architecture decision records                               |
| [Glossary](CONTEXT.md)                         | The project's vocabulary                                    |
| [Agent instructions](AGENTS.md)                | How coding agents and contributors work in this repository  |

## Spec-driven development

Behaviour is defined in `docs/specs/` before it is written in code. Each spec lists acceptance criteria with stable ids such as `AC-005-03`; each test names the criteria it proves; a tool reports the gaps.

1. Change or add the spec.
2. Write a failing test that cites the criterion.
3. Implement until it passes.
4. Run `pnpm check`.

This is the same loop for people and for coding agents. `AGENTS.md` (loaded by `CLAUDE.md`) gives agents the map, the loop and the project's non-obvious rules.

## Development

Requirements: Node.js 22 or newer and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm check
```

`pnpm dev` starts the server on port 3000 and the web client on port 5173 in watch mode; open the web client's address. `pnpm check` runs lint, formatting, type check, tests and spec coverage; CI runs the same command. `pnpm spec:coverage` alone prints the coverage table. `pnpm e2e` plays full games in a real browser (it needs Chromium: `pnpm exec playwright install chromium`).

## Hosting

The Docker image and the hosting guides arrive with milestone M4 ([spec 012](docs/specs/012-deployment-and-operations.md)). The target is a single command with no configuration.

## Contributing

Read [`AGENTS.md`](AGENTS.md) first; it applies to human contributors too. Word lists and translations are especially welcome once milestone M2 has landed.

## Licence

[MIT](LICENSE). Third-party material is listed in [`NOTICE.md`](NOTICE.md).
