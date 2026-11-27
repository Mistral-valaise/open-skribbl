# 007 — Presence and resilience

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M2          |

## Intent

Real games have flaky Wi-Fi, late colleagues and people who only want to watch. None of these should break a game or cost anyone their points.

## Behaviour

- **Reconnect.** When a participant's connection drops, their seat is kept and others see them as disconnected. The client reconnects on its own and resumes the same seat with the same score. A page reload behaves the same way.
- **Leaving.** A participant who stays away longer than the grace period, or who chooses **Leave**, is removed from the room.
- **Late join.** Someone who joins as a player during a game watches the current turn, can guess from the next turn on, and gets a drawing turn in the current round.
- **Spectators.** Anyone can join as a spectator: they see the game and chat on the common channel, never draw, never guess and have no score.
- **Host migration.** When the host is removed, another participant becomes host and everyone is told.

## Rules

### Seats and sessions

- On join the server issues a `sessionToken` for the seat. The client keeps it in `sessionStorage` under the room code and sends it with `join` to resume.
- A `join` with a valid token for a live seat resumes it: same participant id, role, score and turn status. Nickname and avatar are taken from the seat, not from the new message.
- A `join` with an unknown or expired token is treated as a new join.
- If a seat's connection is still open when it is resumed from elsewhere, the old connection is closed with `replaced`.

### Grace period

| Constant                                | Value                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Seat grace period                       | 60 s                                                                    |
| Drawer grace during choosing or drawing | 10 s (spec 002)                                                         |
| Client reconnect backoff                | 0.5 s, 1 s, 2 s, 4 s, then every 5 s, until the grace period has passed |

- A disconnected participant keeps their seat, appears with `connected: false`, and still counts toward capacity.
- When the grace period expires, or on an explicit **Leave**, the seat is removed. A removed player who had earned points still appears in the results of that game, marked as left.
- Rejoining after removal creates a new seat with score 0.

### Late join

- A player who joins during choosing or drawing is **waiting** for that turn: their messages are handled like a spectator's (spec 004), they are not a guesser of the turn, and they cannot like.
- From the next turn on they are a normal player. They are appended to the current round's order.

### Spectators

- The role is chosen when joining and cannot be changed without leaving and rejoining.
- Spectators receive snapshots with the mask during drawing, never the word before turn end.
- Spectators can send reactions (spec 008), cannot like.

### Host migration

- When the host's seat is removed, the host role passes to the connected participant who joined earliest, players before spectators.
- A host who is merely disconnected within the grace period stays host.
- If the lobby has no connected host for 60 s, the role migrates as above.

### Shutdown

- On `SIGTERM` the server sends `server.shutdown` to every participant and closes all connections within 5 s. The client shows "The server is restarting" and a button to return home.

## Acceptance criteria

- **AC-007-01** After a connection drop, every other participant's snapshot shows that participant with `connected: false` and an unchanged score.
- **AC-007-02** A `join` with the seat's `sessionToken` within 60 s resumes the same participant id and score, and the response contains the current snapshot and op log.
- **AC-007-03** A resumed seat keeps its nickname and avatar even if the `join` message carries different ones.
- **AC-007-04** A player who had guessed before disconnecting is still marked as guessed after resuming in the same turn and still sees the word.
- **AC-007-05** When 60 s pass without a resume, the seat is removed from all snapshots and a later `join` with its token creates a new seat with score 0.
- **AC-007-06** An explicit leave removes the seat immediately, without a grace period.
- **AC-007-07** A removed player with a non-zero score appears in that game's results, marked as left; one with score 0 does not.
- **AC-007-08** Resuming a seat whose old connection is still open closes the old connection with `replaced`; the seat exists once.
- **AC-007-09** After a simulated network loss of 5 s the web client is back in the game on the same seat without user action.
- **AC-007-10** A page reload during a game returns the participant to the same seat with the canvas showing the current drawing.
- **AC-007-11** A player who joins during the drawing phase does not receive the word, is not counted for `all_guessed`, and a correct word sent by them is dropped with `message_blocked`.
- **AC-007-12** A player who joined mid-turn is a guesser in the next turn and is the drawer once before the current round ends.
- **AC-007-13** A spectator never appears in the turn order or the ranking, and their snapshot contains the mask, not the word, during drawing.
- **AC-007-14** A `draw.op`, `word.choose` or `like.set` from a spectator is rejected with `not_allowed`.
- **AC-007-15** When the host's seat is removed, the earliest-joined connected player becomes host, and every participant receives a system message naming the new host.
- **AC-007-16** A host who disconnects and resumes within the grace period during a game is still host.
- **AC-007-17** On `SIGTERM` every connected client receives `server.shutdown` before its connection closes.

## Out of scope

Switching between player and spectator without rejoining, resuming after a server restart, moving a seat to another device.
