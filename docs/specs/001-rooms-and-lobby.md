# 001 — Rooms and lobby

|           |          |
| --------- | -------- |
| Status    | Approved |
| Milestone | M1       |

## Intent

A team needs a private place to play that takes seconds to create and one link to share. The room is the only container of state in Kritzel; the lobby is where a group gathers and the host sets the rules.

## Behaviour

- Anyone creates a room from the home screen and lands in its lobby as the host. The lobby shows the room code and a **Copy link** button; the link is `<origin>/r/<CODE>`.
- Others join by opening the link or by typing the code on the home screen. They enter a nickname (prefilled from their last visit) and join as a player or as a spectator (spec 007).
- Everyone in the lobby sees the participants and the current settings. Only the host can change settings; changes appear for everyone immediately.
- The host starts the game once at least two players are connected. The host can kick any other participant at any time.
- When a game ends and the host chooses **Play again**, the room returns to the lobby with the same participants and settings and all scores reset to zero.
- A room nobody is connected to disappears after five minutes.

## Rules

### Room code

- Six characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `I`, `L`, `O`, `0`, `1`), generated at random and unique among live rooms.
- Input is case-insensitive and ignores surrounding whitespace.

### Capacity

- At most `maxPlayers` players (setting) and 8 spectators per room.
- At most `MAX_ROOMS` rooms per instance (default 500); creation beyond that fails with `server_full`.

### Settings

| Setting           | Values                            | Default                   |
| ----------------- | --------------------------------- | ------------------------- |
| `language`        | `en`, `de`, `es`, `fr`            | Host's interface language |
| `rounds`          | 1–10                              | 3                         |
| `drawTime`        | 30–180 s in steps of 10           | 80                        |
| `wordChoices`     | 2–5                               | 3                         |
| `hints`           | 0–5                               | 2                         |
| `difficulty`      | `easy`, `medium`, `hard`, `mixed` | `mixed`                   |
| `maxPlayers`      | 2–12                              | 8                         |
| `customWords`     | list, see spec 006                | empty                     |
| `customWordsOnly` | boolean                           | false                     |

- Settings can be changed only in the lobby phase and only by the host.
- `maxPlayers` cannot be set below the current number of players.

### Host

- The first participant to join a room is its host. A spectator can be host.
- Host migration is specified in spec 007.

### Kick

- A kicked participant is removed immediately, receives `kicked`, and their `clientId` cannot rejoin that room.
- Kicking the drawer ends the turn as described in spec 002 (`drawer_left`).

### Join errors

| Code               | When                                                     |
| ------------------ | -------------------------------------------------------- |
| `room_not_found`   | No live room has this code.                              |
| `room_full`        | The player or spectator capacity is reached.             |
| `kicked`           | The `clientId` was kicked from this room.                |
| `invalid_nickname` | The nickname fails validation (spec 010).                |
| `version_mismatch` | The client's protocol version differs from the server's. |

## Acceptance criteria

- **AC-001-01** `POST /api/rooms` returns a six-character code using only the allowed alphabet, and two consecutive calls return different codes.
- **AC-001-02** The first participant to join a new room is its host and the room is in the lobby phase.
- **AC-001-03** Joining with a lower-case code or a code with surrounding spaces enters the same room as the exact code.
- **AC-001-04** Joining a code that does not exist fails with `room_not_found`.
- **AC-001-05** When `maxPlayers` players are seated, another player join fails with `room_full`, while a spectator join still succeeds.
- **AC-001-06** A settings update from the host is reflected in the next snapshot of every participant.
- **AC-001-07** A settings update from a non-host, or in any phase other than the lobby, leaves the settings unchanged and returns `not_allowed`.
- **AC-001-08** A settings update with any value outside its range is rejected as a whole and changes nothing.
- **AC-001-09** `game.start` with fewer than two connected players is rejected with `not_enough_players`.
- **AC-001-10** `game.start` from a non-host is rejected with `not_allowed`.
- **AC-001-11** After the host kicks a participant, that participant receives `kicked`, disappears from every snapshot, and a new join with the same `clientId` fails with `kicked`.
- **AC-001-12** `player.kick` from a non-host, or targeting the host, is rejected with `not_allowed`.
- **AC-001-13** After `game.playAgain` from the host at game end, the room is in the lobby phase, every score is 0, and participants and settings are unchanged.
- **AC-001-14** A room with no connected participant for five minutes is disposed and its code then yields `room_not_found`.
- **AC-001-15** The lobby shows the invite link `<origin>/r/<CODE>`, and **Copy link** places exactly that URL on the clipboard.
- **AC-001-16** Opening `/r/<CODE>` for a live room shows the join form for that room; for an unknown code it shows a "room not found" message with a way back to the home screen.

## Out of scope

Public room lists, passwords, room names, transferring the host role manually, vote kicks.
