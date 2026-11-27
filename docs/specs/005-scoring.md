# 005 — Scoring

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M1          |

## Intent

Points reward guessing fast and drawing clearly. The formulas are simple enough to explain in one sentence each and exact enough to test.

## Behaviour

- A guesser earns more points the earlier they guess. The first to guess in a turn gets a small bonus.
- The drawer earns points depending on how many guessers got it and how fast.
- The scoreboard shows every player's total, sorted by score, and updates as soon as points are earned. At turn end everyone sees what each player earned in that turn.

## Rules

### Guesser points

```
guessPoints = 100 + floor(400 × remaining / drawTime)
```

- `remaining` is the time left in the drawing phase when the server accepts the guess, clamped to `0…drawTime`.
- The first correct guess of a turn earns an additional **50**.

Example with `drawTime` 80 s: a guess after 20 s has 60 s remaining → `100 + floor(400 × 0.75)` = 400; if it is the first, 450.

### Drawer points

```
drawerPoints = floor(sum of all guess points of the turn, bonus included / number of guessers of the turn)
```

- "Guessers of the turn" is the set fixed at the start of drawing (spec 002); guessers who did not guess count with 0.
- If the turn ends with `drawer_left`, the drawer earns 0.

Example: three guessers, two guess for 450 and 300 → `floor(750 / 3)` = 250.

### When points are applied

- Guess points are added to the guesser's score immediately.
- Drawer points are added at turn end.
- The turn-end snapshot lists each player's delta for the turn (0 for none).

### Ranking

- Players are ranked by score, highest first. Equal scores share a rank and are listed in join order; the next rank skips accordingly (1, 2, 2, 4).
- Spectators have no score and no rank.
- Scores persist across disconnects within the grace period and reset when a new game starts.

## Acceptance criteria

- **AC-005-01** With `drawTime` 80 s, a correct guess accepted with 60 s remaining that is not the first of the turn earns 400 points.
- **AC-005-02** A correct guess accepted with 0 s remaining earns 100 points; one accepted at the very start of drawing earns 500.
- **AC-005-03** The first correct guess of a turn earns 50 points on top of its guess points; later guesses in the same turn earn no bonus.
- **AC-005-04** With three guessers of whom two guess for 450 and 300 points, the drawer earns 250 points at turn end.
- **AC-005-05** If no guesser guesses, the drawer earns 0 points.
- **AC-005-06** If the turn ends with `drawer_left`, the drawer earns 0 points and guessers keep the points already earned.
- **AC-005-07** A guesser's score in the snapshot increases in the same update that announces their correct guess; the drawer's score increases only at turn end.
- **AC-005-08** The turn-end snapshot contains a delta for every player, equal to the points that player earned in the turn.
- **AC-005-09** Players with scores 900, 700, 700 and 300 receive ranks 1, 2, 2 and 4; the two tied players are ordered by join time.
- **AC-005-10** A guesser who disconnects after guessing and returns within the grace period has the same score as before.
- **AC-005-11** A guesser of the turn who disconnects without guessing still counts in the divisor of the drawer's points.
- **AC-005-12** When a new game starts in the same room, every score is 0.

## Out of scope

Streak bonuses, penalties for wrong guesses, points for likes, handicaps.
