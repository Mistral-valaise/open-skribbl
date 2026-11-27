# 011 — App shell

|           |          |
| --------- | -------- |
| Status    | Proposed |
| Milestone | M4       |

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

- Effects: join, your turn, your correct guess, another player's correct guess, tick (each of the last 10 s of the drawing phase), turn end, win.
- Synthesised with the Web Audio API; no audio files. Audio starts only after the first user interaction.
- Muted state is stored; default is unmuted.

### Layout

- Breakpoints: below 640 px, 640–1279 px, 1280 px and up, with the layouts defined in the design guideline.
- No horizontal scrolling at any width from 320 px.
- On phones the chat input remains visible when the on-screen keyboard is open.

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

## Out of scope

Installable offline app, custom themes, per-effect volume controls, right-to-left layouts.
