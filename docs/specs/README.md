# Specs

Specs are the source of truth for behaviour. Code implements a spec; a test proves an acceptance criterion; a behaviour change starts here.

## Index

| #   | Spec                                                          | Milestone |
| --- | ------------------------------------------------------------- | --------- |
| 001 | [Rooms and lobby](001-rooms-and-lobby.md)                     | M1        |
| 002 | [Game loop](002-game-loop.md)                                 | M1        |
| 003 | [Drawing](003-drawing.md)                                     | M1        |
| 004 | [Guessing and chat](004-guessing-and-chat.md)                 | M1        |
| 005 | [Scoring](005-scoring.md)                                     | M1        |
| 006 | [Words and languages](006-words-and-languages.md)             | M2        |
| 007 | [Presence and resilience](007-presence-and-resilience.md)     | M2        |
| 008 | [Reactions and gallery](008-reactions-and-gallery.md)         | M2        |
| 009 | [Solo mode](009-solo-mode.md)                                 | M3        |
| 010 | [Identity and avatars](010-identity-and-avatars.md)           | M2        |
| 011 | [App shell](011-app-shell.md)                                 | M4        |
| 012 | [Deployment and operations](012-deployment-and-operations.md) | M4        |
| 101 | [Bots](roadmap/101-bots.md)                                   | after v1  |
| 102 | [Team mode](roadmap/102-team-mode.md)                         | after v1  |

## Format

Every spec has this shape:

```text
# NNN — Title

| | |
| --- | --- |
| Status | Draft, Proposed, Approved or Implemented |
| Milestone | M1 |

## Intent
Why this exists, in two or three sentences.

## Behaviour
What happens, from the participant's point of view.

## Rules
Exact values, limits and formulas.

## Acceptance criteria
- **AC-NNN-01** One observable, testable statement.

## Out of scope
What a reader might expect here and will not find.
```

### Status

| Status      | Meaning                                        |
| ----------- | ---------------------------------------------- |
| Draft       | Idea under discussion; do not implement.       |
| Proposed    | Complete and waiting for the owner's approval. |
| Approved    | Ready to implement.                            |
| Implemented | Every acceptance criterion has a passing test. |

### Acceptance criteria

- An id is `AC-<spec>-<number>` and never changes or gets reused. A removed criterion keeps its line, struck through, with the reason.
- A criterion describes one observable outcome with concrete values, so a test can be written from the sentence alone.
- Tests cite the ids they prove in their title: `it('AC-005-03: the first correct guess earns the bonus', …)`. One test may cite several ids.

## Workflow

1. **Specify.** Change the spec first: behaviour, rules, criteria. New domain terms go into [`CONTEXT.md`](../../CONTEXT.md) in the same change.
2. **Test.** Write tests that cite the criteria and fail.
3. **Implement.** Make them pass in the module [`ARCHITECTURE.md`](../ARCHITECTURE.md) assigns.
4. **Verify.** `pnpm check` is green and `pnpm spec:coverage` lists no uncovered criterion for the spec.
5. **Close.** Set the spec's status to `Implemented` and update [`ROADMAP.md`](../ROADMAP.md).

When code and spec disagree, the spec wins; if the spec is wrong, fix the spec in the same change as the code.

## Coverage tool

`pnpm spec:coverage` lists every acceptance criterion and the test files citing it. `pnpm spec:coverage --strict` exits non-zero when a spec marked `Implemented` has an uncovered criterion; CI runs the strict form.
