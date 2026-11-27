# 005 — Scoring

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M1          |

## Intent

Points reward guessing fast and drawing clearly. The formulas are simple enough to explain in one sentence each and exact enough to test.

## Behaviour

- A guesser earns more points the earlier they guess. The first to guess in a turn gets a small bonus.
- The drawer earns points depending on how many guessers got it and how fast, but half of what a guesser earns on average: guessing is worth more than drawing, so two players who guess at different speeds end with different scores.
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
drawerPoints = floor(sum of all guess points of the turn, bonus included / (2 × number of guessers of the turn))
```

- "Guessers of the turn" is the set fixed at the start of drawing (spec 002); guessers who did not guess count with 0.
- If the turn ends with `drawer_left`, the drawer earns 0.

- The divisor 2 is what keeps a game for two from being a permanent tie. Without it the drawer of a turn with one guesser earned exactly what the guesser earned, in every turn.

Example: three guessers, two guess for 450 and 300 → `floor(750 / 6)` = 125.

Example for two players with `drawTime` 80 s: A draws and B guesses after 10 s → B earns `100 + 350 + 50` = 500, A earns 250. Then B draws and A guesses after 40 s → A earns `100 + 200 + 50` = 350, B earns 175. A has 600, B has 675: the faster guesser leads.

A consequence worth knowing: in a game for two, a player who draws badly on purpose costs the opponent more than themselves. Every rule that pays the drawer less than the guesser has this property, and one that pays more rewards guessing slowly instead. For a party game among people who know each other this is accepted.

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
- ~~**AC-005-04** With three guessers of whom two guess for 450 and 300 points, the drawer earns 250 points at turn end.~~ Replaced by AC-005-13 when the drawer's share was halved.
- **AC-005-05** If no guesser guesses, the drawer earns 0 points.
- **AC-005-06** If the turn ends with `drawer_left`, the drawer earns 0 points and guessers keep the points already earned.
- **AC-005-07** A guesser's score in the snapshot increases in the same update that announces their correct guess; the drawer's score increases only at turn end.
- **AC-005-08** The turn-end snapshot contains a delta for every player, equal to the points that player earned in the turn.
- **AC-005-09** Players with scores 900, 700, 700 and 300 receive ranks 1, 2, 2 and 4; the two tied players are ordered by join time.
- **AC-005-10** A guesser who disconnects after guessing and returns within the grace period has the same score as before.
- **AC-005-11** A guesser of the turn who disconnects without guessing still counts in the divisor of the drawer's points.
- **AC-005-12** When a new game starts in the same room, every score is 0.
- **AC-005-13** With three guessers of whom two guess for 450 and 300 points, the drawer earns 125 points at turn end.
- **AC-005-14** In a game for two with `drawTime` 80 s, when the first guess comes after 10 s and, with roles swapped, the second after 40 s, the scores are 600 and 675: the faster guesser leads.

## Out of scope

Streak bonuses, penalties for wrong guesses, points for likes, handicaps.
