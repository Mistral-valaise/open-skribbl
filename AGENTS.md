# Kritzel — agent instructions

Kritzel is a self-hosted, ad-free draw-and-guess party game: a pnpm TypeScript monorepo with a React client, a Node WebSocket server and a shared rules package. Development is **spec-driven**: specs in `docs/specs/` define behaviour, tests prove acceptance criteria, code follows.

## Where things are

| Read this                                      | When                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`CONTEXT.md`](CONTEXT.md)                     | Before naming anything. It is the glossary; identifiers, tests and UI copy use its terms exactly. |
| [`docs/specs/README.md`](docs/specs/README.md) | Before changing behaviour. Spec format, statuses, the workflow, the index of specs.               |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Before adding a file or a dependency. Module boundaries, protocol, where each rule lives.         |
| [`docs/DESIGN.md`](docs/DESIGN.md)             | Before touching anything visible. Tokens, components, screen layouts, copy rules.                 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)           | To find the current milestone and what is next.                                                   |
| [`docs/adr/`](docs/adr/)                       | When a design choice looks odd. The reasons are recorded there.                                   |
| [`docs/PRD.md`](docs/PRD.md)                   | For goals, non-goals and the decision log.                                                        |

## The loop

Every change that alters behaviour runs this loop, one acceptance criterion or a small group at a time:

1. **Spec.** Find the criterion in `docs/specs/`. If the behaviour is not specified, edit the spec first and say so in the change description.
2. **Red.** Write a test whose title cites the id, e.g. `it('AC-005-03: the first correct guess earns the bonus')`, and watch it fail.
3. **Green.** Implement in the module `ARCHITECTURE.md` assigns.
4. **Check.** `pnpm check` passes and `pnpm spec:coverage` shows the criterion covered.

A milestone is complete when each of its specs has every criterion covered, its status set to `Implemented`, and `docs/ROADMAP.md` updated.

## Commands

`package.json` scripts are the source of truth. The ones that gate a change:

- `pnpm check`: lint, type check, tests and spec coverage in one run. Run it before every commit.
- `pnpm spec:coverage`: which acceptance criteria have tests.
- `pnpm e2e`: Playwright tests in `e2e/` against the built app and the real server. Run it when a change touches `apps/web`, the protocol or the game flow.

## Rules that are easy to miss

- **Rules live in `packages/shared` as pure functions.** Time and randomness arrive as arguments (`ctx.now`, `ctx.random`); the server runtime and tests supply them. A rule that needs a timer returns a `scheduleTimer` effect.
- **The server decides, the client renders.** Game logic in `apps/web` is limited to presentation and the drawer's optimistic strokes.
- **`viewFor` is the single gate for visibility.** Anything a participant may see passes through it; the secret word reaches a client only through that function.
- **Spec constants are defined once** in `packages/shared` and imported; a number that appears in a spec appears in exactly one place in code.
- **Same-origin only.** Fonts, icons, sounds and data are bundled. A dependency or asset that would contact another host at runtime does not go in.
- **Every visible string goes through `t()`**, with keys present in `en`, `de`, `es` and `fr`.
- **Colours come from design tokens**; raw hex values belong in the token file and the drawing palette only.
- **Logs carry counts and room codes**, never nicknames, chat text, words or tokens.
- **Packages import each other through the package root**; `apps/web` and `apps/server` stay independent of each other.

## Conventions

- TypeScript strict; parse external input with Zod at the boundary and work with typed values inside.
- Player-caused failures are `error` messages with a code from the spec; exceptions signal programmer mistakes.
- Tests sit next to the code as `*.test.ts`; end-to-end tests live in `e2e/`.
- Reducer tests use the harness in `packages/shared/src/testing/harness.ts`; server tests use `apps/server/src/testing/client.ts` with a manual clock. Time moves only when a test advances it.
- Interactive elements the end-to-end tests touch carry a `data-testid`; keep existing ids stable.
- Commit messages: imperative summary, with the spec or criterion ids the change addresses (`Add hint schedule (AC-006-15..18)`).
- Documentation and code are in English. UI copy in German, Spanish and French addresses the player informally.

## Scope guard

Kritzel is an original game. Names, artwork, word lists and layouts are created for this project; third-party material enters only with a compatible licence and an entry in `NOTICE.md`.
