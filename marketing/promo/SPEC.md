# Spec

```text
GOAL:    The viewer understands the game in five seconds and leaves knowing they can host it themselves, without ads.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    31 s x 30 = 930 frames; no music, no sound (requested)
LOOK:    Two worlds, both the product's own.
         Paper: ground #FFFFFF flat, ink #14151C, secondary ink #4C5166. One accent, #6A5AF9 (#5546E0 as text),
         on the squiggle under the wordmark and on one phrase per title, nowhere else.
         Interface: the recorded game on its own dark surface, full frame or cropped to the part that proves the line.
         Display: Bricolage Grotesque 700, 112 to 132 px for titles (10 to 12 % of the height), 380 px for the wordmark,
         tracking -0.02em. Body: Inter 400/700, 40 px. Code: JetBrains Mono 400, 38 px.
         Footage windows on paper: radius 24 px, shadow 0 24 px 64 px at 18 % ink. No grain, no vignette.
OBJECTS: The drawing: the real canvas, cropped out of the recording so it sits on the paper.
         The guesses: the chat lines of that game, set large next to the drawing.
         The phone: the recording at 390 x 844 inside a plain black bezel, radius 56 px.
         The command: one line of mono on an ink block, radius 16 px.
MOTION:  enter expo.out or power4.out, 0.5-0.7 s; camera and wipes power2.inOut; exits power2.in, 0.2 s.
         Words blur in (6 px to 0, 0.2 s), 0.08 s apart; nothing moves after it has landed.
         No springs, no loops.
SHOTS:   0.0-5.4   hook       the canvas fills the right of the paper and the lighthouse is drawn at about three times its speed;
                              five guesses land on the left, the last one close. Hands off: the paper opens to the interface.
         5.4-9.6   result     the same drawing, now inside the full interface; the first right guess arrives (7.0),
                              cut to the turn-end card with the word and the points (7.6). Hands off: iris from the card's thumbnail.
         9.4-12.2  reveal     paper; "Kritzel" letter by letter, the squiggle is drawn, "Draw. Guess. No ads."
         12.2-15.4 lobby      "Send a link." beside the lobby, where three players arrive one after another.
         15.4-18.8 screens    "Phone to desktop." the same turn on a phone (dark) and a desktop (light), in step.
         18.8-21.4 languages  "Four languages." the home screen switches language; the active name is inked.
         21.4-24.0 claim      three lines of type: "No ads. No accounts. No tracking."
         24.0-27.2 podium     the results with the podium and the confetti, full frame.
         27.0-31.0 end card   the wordmark, the command, the repository and the credit; held 2.7 s.
BANNED:  a dark void with small things floating in it; glow, particles; gradients; glass;
         everything centred; every scene entering the same way; titles that move after landing;
         a title over a dimmed screenshot; three cards in a row; the logo in a corner;
         numbers typeset by hand (scores vary by run: they are shown only as the interface shows them);
         any interface that is not a recording of the game.
QA:      0.0 not empty: paper, half a tower, the drawer's name.
         4.5 all five guesses readable, the drawing complete.
         8.5 the turn-end card readable: the word and four scores.
         11.5 wordmark, squiggle and tagline at rest.
         14.5 four players in the lobby.
         17.5 the same drawing on both screens.
         26.0 the podium with three avatars.
         30.0 the command readable at phone width.
```
