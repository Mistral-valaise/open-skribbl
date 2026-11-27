# 101 — Bots

|           |          |
| --------- | -------- |
| Status    | Draft    |
| Milestone | after v1 |

## Intent

Stage 2 of playing against the computer: bots are computer-controlled players that sit in a normal room, draw when it is their turn and guess when it is not. A single person can then play the full game, and a small team can fill empty seats.

## Behaviour (intended)

- In the lobby the host adds up to three bots and picks a skill level for each. Bots appear as players with a bot badge.
- **A bot draws** by replaying a drawing from the solo dataset through the normal op pipeline, so guessers cannot tell the transport apart from a human's.
- **A bot guesses** by running a sketch-recognition model over the current drawing at intervals and sending its best labels as chat messages, with human-like delays and occasional wrong guesses according to its skill level.
- Bots score like players. A room with only bots and no connected human is disposed like an empty room.

## Open questions

1. **Recognition model.** Train a small convolutional or stroke-sequence model on the Quick, Draw! categories, or adopt an existing openly licensed one? Target: under 5 MB, inference under 50 ms on the server's CPU.
2. **Where inference runs.** On the server (bots are ordinary reducer participants, costs CPU per room) or in the host's browser (free for the server, but ties bots to one client).
3. **Word pool.** Rooms with bots must restrict words to the dataset's categories, or bots can neither draw nor guess. How is that communicated in the settings?
4. **Fairness.** How fast may a bot guess, and how do skill levels map to confidence thresholds and delays?
5. **Custom words** cannot be drawn or guessed by bots; disable them when bots are present?

## Preconditions

- Spec 009 implemented (dataset pipeline and replay engine).
- [ADR 0003](../../adr/0003-pure-reducer-game-engine.md) holds: a bot is a participant whose intents come from a bot driver instead of a WebSocket.

## Out of scope

Language-model-based bots, bots that chat, bots in solo runs.
