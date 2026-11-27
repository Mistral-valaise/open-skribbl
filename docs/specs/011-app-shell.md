# 011 — App shell

|           |             |
| --------- | ----------- |
| Status    | Implemented |
| Milestone | M4          |

## Intent

The shell is everything around the game that makes Kritzel feel finished: themes, sound, layouts for every screen size, and access for everyone. It implements [`DESIGN.md`](../DESIGN.md); this spec lists what must be verifiably true.

## Behaviour

- The app follows the system's light or dark preference on first visit and has a theme toggle that is remembered.
- Sounds mark the key moments; one mute toggle silences everything and is remembered.
- The same features are available at phone, tablet and desktop widths, arranged as the design guideline describes.
- Everything except freehand drawing works with a keyboard and a screen reader.
- Connection problems are visible: a banner appears while the client is reconnecting.

## Rules

### Theme

- Themes: `dark`, `light`. Initial value from `prefers-color-scheme`; the stored choice wins. The theme is applied before first paint, so there is no flash of the wrong theme.
- The canvas is white in both themes.

### Sound

- Effects: join (any participant joins, yourself included), your turn, your correct guess, another player's correct guess, tick (each of the last 10 s of the drawing phase), turn end, win (for everyone when the results appear).
- Synthesised with the Web Audio API; no audio files. Audio starts only after the first user interaction.
- Muted state is stored; default is unmuted.

### Layout

- Breakpoints: below 640 px, 640–1279 px, 1280 px and up, with the layouts defined in the design guideline.
- No horizontal scrolling at any width from 320 px.
- On phones the game follows the height that is actually visible. While the on-screen keyboard is open, the screen shows one row with round, mask and timer, the whole canvas as large as the remaining height allows, the latest chat message and the input. The shell controls, reactions, likes, scoreboard, drawing tools and older chat messages are hidden until the keyboard closes. Solo mode does the same.
- The keyboard counts as open at phone width when the visible height is at least 120 px less than the tallest seen at that width, or below 352 px.

### Credit

- Every centred page (home, join, solo start, status pages) ends with "Created by Mistral N"; the name links to the author's site, `https://mistraln.de/`. The game screen does not carry it: the canvas is the stage.
- The link is plain navigation, opened in a new tab without a referrer. Nothing is loaded from that site.

### Accessibility

- All interactive elements are reachable by Tab in visual order, operable with Enter or Space, and show the focus ring.
- Modals trap focus and close on Escape, returning focus to the element that opened them.
- The chat log is a polite live region; phase changes and the 30 s and 10 s marks are announced.
- With `prefers-reduced-motion: reduce`, confetti and floating reactions do not animate.
- Text and interface glyphs meet the contrast ratios in the design guideline in both themes.

### Feedback states

- While reconnecting: a banner "Reconnecting…"; controls that need the server are disabled.
- Errors from the server appear as a toast in the participant's language.
- A JavaScript error in one screen shows an error panel with a reload action instead of a blank page.

## Acceptance criteria

- **AC-011-01** With no stored choice, the app renders dark under `prefers-color-scheme: dark` and light under `light`.
- **AC-011-02** The theme toggle switches the theme immediately, and the choice is applied on reload before first paint.
- **AC-011-03** The canvas background is `#FFFFFF` in both themes.
- **AC-011-04** Each of the seven sound events triggers its effect when unmuted and none when muted; the muted state survives a reload.
- **AC-011-05** No audio context is started before the first user interaction.
- **AC-011-06** At viewport widths 320, 375, 768, 1024 and 1440 px the home, lobby, game and results screens have no horizontal scroll bar and no overlapping controls.
- **AC-011-07** At 375 px width a guesser can read the mask, see the timer, see the canvas and type a guess without scrolling.
- **AC-011-08** At 375 px width the drawer can reach every tool, size and colour.
- **AC-011-09** A full game can be hosted, joined and guessed using only the keyboard.
- **AC-011-10** An automated accessibility scan (axe) of the home, lobby, game and results screens reports no serious or critical violations in either theme.
- **AC-011-11** Every text and background token pair used by the components meets its required contrast ratio in both themes, verified by an automated test over the token file.
- **AC-011-12** With reduced motion requested, the results screen shows no confetti animation and reactions appear without movement.
- **AC-011-13** While the connection is down the reconnecting banner is visible, and it disappears once the seat is resumed.
- **AC-011-14** A server error code is shown as a translated toast, never as a raw code.
- **AC-011-15** During a full game the browser makes no request to any origin other than the app's own.
- **AC-011-16** The favicon, the page title "Kritzel" and a web app manifest with name and icons are present.
- **AC-011-17** At 360 px width, when the visible height drops from 740 px to 330 px (a phone whose keyboard opens), a guesser sees the whole canvas, the mask, the timer, the latest chat message and the chat input without scrolling, and the canvas is at least 240 px wide.
- **AC-011-18** In solo mode at 360 px width, when the visible height drops to 330 px, the whole canvas, the mask, the timer and the guess input are visible without scrolling.
- **AC-011-19** When the visible height returns to 740 px, the reaction bar, the scoreboard and the chat log are visible again.
- **AC-011-20** The home, join and solo start pages show "Created by Mistral N" in the interface language, with the name linking to `https://mistraln.de/` in a new tab without a referrer; loading those pages sends no request to that site.

## Out of scope

Installable offline app, custom themes, per-effect volume controls, right-to-left layouts.
