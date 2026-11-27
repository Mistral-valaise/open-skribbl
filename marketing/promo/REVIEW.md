# Review

The state of the film at the render of 27 November 2026.

## Creative calls

- Storyline A of `STORYLINES.md`: the film opens inside a drawing that is being guessed and names the game only after the turn has ended. B (a moment in a team's day) and C (one command, as an endless zoom) were not built; both would have needed interfaces that are not Kritzel's.
- Two worlds: white paper for words, the recorded interface for proof. The accent colour appears on the squiggle and on "No ads." only.
- The guesses beside the drawing are the chat lines of the recorded game, set large. Points are never typeset: they appear only as the interface shows them, because they change by a few points with every recording.
- No sound, as requested.

## Measured

- `hyperframes check`: no errors. Two warnings are kept on purpose: `film_silent` (silence was requested) and `nested_media_start_basis_ambiguous` on the turn-end clip, whose start is local to its scene as intended.
- The closing line is on screen for 3.2 s (the check asks for 2.85 s).

## Looked at

- The beat sheet, the strips across every cut and the sheet at phone width (`hyperframes snapshot --review`), plus single frames at 4.9, 7.3, 11.6, 14.9, 18.4, 29.5 and 30.75 s.
- First frame: paper, the drawer's name and a half-drawn tower; it is not empty.
- Fixes after the first pass: the five guesses moved up, because the last one touched the waves of the drawing; the crop of the canvas ends above its rounded corners, which showed as two dark specks.

## Not checked

- The rendered file was not watched at full speed by a person. Motion between the sampled frames was judged from strips, not from playback.

## Weakest shot

- "Four languages" (18.8 to 21.4 s): the home screen changes its labels, which is a small change in a small window. A recording of a game played in German, with the word mask and the chat in that language, would prove more.
