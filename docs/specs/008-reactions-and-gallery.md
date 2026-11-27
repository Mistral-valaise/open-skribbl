# 008 — Reactions and gallery

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M2          |

## Intent

The best moments of a drawing game are the drawings themselves. Reactions let the room respond while a drawing happens; the gallery lets the team keep the masterpieces afterwards.

## Behaviour

- **Reactions.** During the drawing phase everyone except the drawer can tap one of six emoji. It floats up over the canvas for everybody, the drawer included.
- **Likes.** Each player other than the drawer can give the current drawing a thumbs-up or thumbs-down and change their mind until the turn ends. Totals appear at turn end.
- **Results.** At game end everyone sees the podium, the full ranking and the gallery: every drawing of the game with its word, drawer and likes. The drawing with the most thumbs-up is highlighted as "Crowd favourite".
- **Download.** Any drawing in the gallery can be downloaded as a PNG.

## Rules

### Reactions

- Emoji set: 😂 😍 👏 🔥 🤔 💀.
- At most one reaction per participant per 1.5 s; excess is dropped silently.
- Reactions are not stored and do not affect points.
- Allowed for players (not the drawer) and spectators, in the drawing phase only.

### Likes

- One value per player per turn: `up` or `down`; sending again replaces it. Players only; not the drawer, not spectators, not players waiting after a late join.
- Accepted during the drawing phase and the turn-end display.
- Totals are part of the turn-end snapshot and of the gallery entry. Individual likes are not disclosed; each participant's snapshot carries only their own like, so it survives a reload. Likes do not affect points.

### Results and gallery

- The game-end snapshot contains the ranking (spec 005) and one gallery entry per completed turn, in play order: turn index, round, drawer id and name, word, likes up and down, number of guessers who guessed, number of guessers.
- Turns that ended with `drawer_left` before any item was drawn are omitted.
- Op logs are fetched on demand with `gallery.get` and stay available until the room leaves the game-end phase.
- "Crowd favourite" is the entry with the most thumbs-up; ties go to the earlier turn; with no thumbs-up at all there is no favourite.

### PNG export

- Rendered in the browser from the op log at 1600 × 1200 on a white background.
- File name: `kritzel-<word>-<drawer>.png`, lower-cased, with characters other than letters, digits and hyphens replaced by hyphens.

## Acceptance criteria

- **AC-008-01** A reaction from a guesser in the drawing phase is delivered to every participant, including the drawer.
- **AC-008-02** A reaction from the drawer, a reaction outside the drawing phase, or an emoji outside the set is rejected and not delivered.
- **AC-008-03** A second reaction from the same participant within 1.5 s is not delivered.
- **AC-008-04** A player's `like.set` `up` followed by `down` in the same turn results in totals of 0 up and 1 down.
- **AC-008-05** `like.set` from the drawer, a spectator or a waiting player is rejected with `not_allowed`.
- **AC-008-06** Like totals are absent from snapshots during the drawing phase and present in the turn-end snapshot.
- **AC-008-07** The game-end snapshot lists one gallery entry per completed turn in play order, each with word, drawer name and like totals.
- **AC-008-08** `gallery.get` in the game-end phase returns the op log of that turn; in any other phase, or for an unknown index, it is rejected.
- **AC-008-09** With entries having 2, 3 and 3 thumbs-up, the second entry is the crowd favourite; with no thumbs-up anywhere, no entry is.
- **AC-008-10** The results screen shows the top three players on the podium in rank order and all players in the ranking below.
- **AC-008-11** Downloading a gallery drawing produces a PNG of 1600 × 1200 pixels whose content matches the drawing shown.
- **AC-008-12** The download for the word "Ice cream" by "Mara K." is named `kritzel-ice-cream-mara-k-.png`.
- **AC-008-13** After `game.playAgain`, `gallery.get` for the previous game is rejected.

## Out of scope

Animated replay in the gallery (roadmap), downloading all drawings as an archive, sharing links to drawings, likes influencing the score.
