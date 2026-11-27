# 009 — Solo mode

|           |          |
| --------- | -------- |
| Status    | Proposed |
| Milestone | M3       |

## Intent

Sometimes nobody else is around. In solo mode the computer draws and the player guesses: a five-minute game with a personal best to beat, with no server round-trips, no API key and no cost.

This is stage 1 of playing against the computer. Bots that guess the player's drawing are specified in [spec 101](roadmap/101-bots.md).

## Behaviour

- **Play solo** on the home screen opens the solo screen. The player picks the word language (default: interface language) and starts a solo run.
- A run has ten drawings. For each one the computer replays a human-made drawing stroke by stroke while a timer runs. The player types guesses; the mask and hints work as in multiplayer.
- A correct guess scores points by remaining time and moves on after a short reveal. Wrong guesses stay visible in a list; a close guess is marked as close. **Skip** gives up on a drawing for 0 points.
- After ten drawings the summary shows the total, the personal best for that language, and the ten drawings with their words. **Play again** starts a new run.

## Rules

### Content

- Categories and drawings come from the bundled dataset (`packages/content/solo`, served under `/content/solo/`). Each category has an id and a label in `en`, `de` and `es`; each has at least 10 curated drawings.
- A drawing is a list of strokes; a stroke is a list of points in a 256 × 256 space. It is scaled to fit the canvas centred with a 10 % margin and drawn with the brush in `#14151C`, size 8.
- A run draws ten distinct categories at random and one random drawing for each.
- Category labels that are ambiguous or unsuitable in a language are excluded from that language's solo set in `categories.json`.

### Timing

| Constant                                       | Value                                    |
| ---------------------------------------------- | ---------------------------------------- |
| Drawings per run                               | 10                                       |
| Time per drawing                               | 30 s                                     |
| Replay duration                                | 15 s                                     |
| Pause between strokes                          | 150 ms (included in the replay duration) |
| Reveal after a correct guess, skip or time-out | 2.5 s                                    |

- The pen moves at constant speed along the strokes so that the whole drawing completes in the replay duration.
- Hints follow spec 006 with `hints` 2 and a draw time of 30 s.

### Guessing and points

- Matching and close guesses follow spec 004; the label in the run's language is the word.
- `points = 100 + floor(400 × remaining / 30 s)` for a correct guess; 0 for a skip or time-out. There is no first-guess bonus.
- Guesses are unlimited and cost nothing.

### Personal best

- Stored in the browser per language: the best total and the five most recent run totals with dates.
- Nothing about a solo run is sent to the server.

### Offline behaviour

- All files a run needs are fetched before the first drawing starts. A started run finishes without network access.
- If the content cannot be loaded, the screen shows an error with a retry action.

### Attribution

- The solo screen credits the dataset and links to `NOTICE.md` in the repository.

## Acceptance criteria

- **AC-009-01** **Play solo** on the home screen opens `/solo`, and starting a run requires no nickname and no room.
- **AC-009-02** A run presents exactly ten drawings from ten distinct categories.
- **AC-009-03** The replay draws the strokes in their stored order and completes 15 s after the drawing starts, within 0.5 s.
- **AC-009-04** A drawing given in the 256 × 256 space is rendered centred on the canvas with at least a 10 % margin on every side, preserving its aspect ratio.
- **AC-009-05** A correct guess with 15 s remaining scores 300 points; a correct guess at the first instant scores 500; a time-out or skip scores 0.
- **AC-009-06** With word language `de`, the category "cat" is solved by "Katze" and not by "cat".
- **AC-009-07** Tolerant matching applies: "senal de stop" solves a Spanish label "señal de stop".
- **AC-009-08** A close guess is marked as close in the guess list; other wrong guesses are listed unmarked.
- **AC-009-09** The mask shows one revealed letter after 10 s and two after 20 s for a word with at least five letters.
- **AC-009-10** After a correct guess, a skip or a time-out the word is revealed for 2.5 s before the next drawing starts.
- **AC-009-11** The summary lists the ten words with the points earned for each and the total.
- **AC-009-12** A total higher than the stored best for the run's language replaces it; the bests of other languages are unaffected; the value survives a reload.
- **AC-009-13** With the network disabled after the run has started, the run can be completed.
- **AC-009-14** During a solo run the browser sends no WebSocket message and no request other than `GET` requests under `/content/solo/`.
- **AC-009-15** Every category in `categories.json` has non-empty `en`, `de` and `es` labels unless excluded for that language, and a drawings file with at least 10 drawings.
- **AC-009-16** The solo screen shows the dataset credit with a link to the notice.

## Out of scope

The computer guessing the player's drawings, bots in rooms, difficulty levels, online leaderboards, daily challenges.
