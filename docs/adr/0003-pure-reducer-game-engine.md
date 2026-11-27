# The game engine is a pure reducer in `packages/shared`

All room and game rules are implemented as one pure function, `reduce(state, event, ctx) → { state, effects }`, with time and randomness passed in. The server runtime only feeds events and executes effects (send, schedule, dispose).

We chose this over rule logic inside WebSocket handlers and timer callbacks because the rules are the product and must be testable exhaustively without sockets or real time, and because the same engine will later drive bots and local play.

## Consequences

- No rule may read the clock, generate randomness or send messages directly; a change that needs one of these adds an event or an effect.
- Timers are data (`scheduleTimer` effects), so integration tests advance a fake clock instead of waiting.
