# Kritzel — Design Guideline

|                |                                                                   |
| -------------- | ----------------------------------------------------------------- |
| Status         | Proposed (awaiting owner review)                                  |
| Direction      | "Studio": calm, dark-first, professional surface; playful moments |
| Implemented by | `apps/web/src/ui` and the Tailwind theme                          |

## 1. Principles

1. **The canvas is the stage.** It is the brightest, largest element on the game screen. Everything else is quieter than the drawing.
2. **Calm chrome, loud moments.** Surfaces are neutral and typographic. Colour and motion are spent on events: a correct guess, your turn, the podium.
3. **One glance.** At any moment a player can answer three questions without reading: whose turn, how much time, did I guess it.
4. **Friendly, not childish.** Rounded shapes and expressive avatars; no cartoon fonts, no clutter.
5. **Same game on every screen.** Phone, tablet and desktop get the same features, rearranged.

## 2. Brand

- **Name:** Kritzel (German for "scribble"). Always capitalised, never translated.
- **Wordmark:** "Kritzel" set in the display typeface, weight 700, with a hand-drawn squiggle underline in the accent colour. The squiggle alone is the favicon and app icon.
- **Voice:** short, warm, direct. Address the player informally (`du` in German, `tú` in Spanish, `tu` in French). One exclamation mark per screen at most. System messages state facts: "Mara guessed the word", "Time's up — it was _lighthouse_".

## 3. Colour

Tokens are CSS custom properties defined once and exposed to Tailwind. Components reference tokens, never raw values. Dark is the default theme; light is equal in quality.

### Surfaces and text

| Token              | Dark      | Light     | Use                            |
| ------------------ | --------- | --------- | ------------------------------ |
| `--bg-base`        | `#0E0F14` | `#F6F6FA` | Page background                |
| `--bg-raised`      | `#171922` | `#FFFFFF` | Cards, panels                  |
| `--bg-overlay`     | `#1F2230` | `#FFFFFF` | Popovers, modals, inputs       |
| `--bg-hover`       | `#262A3A` | `#EEEFF5` | Hovered rows and ghost buttons |
| `--border`         | `#2A2E3F` | `#E1E3EC` | Dividers, outlines             |
| `--text-primary`   | `#F2F3F7` | `#14151C` | Body and headings              |
| `--text-secondary` | `#A6ABBD` | `#4C5166` | Labels, metadata               |
| `--text-muted`     | `#6E748A` | `#7A8096` | Placeholders, disabled         |

### Accent and semantics

| Token            | Dark      | Light     | Use                                         |
| ---------------- | --------- | --------- | ------------------------------------------- |
| `--accent`       | `#6A5AF9` | `#6A5AF9` | Primary buttons, focus ring, selected state |
| `--accent-hover` | `#7D6FFA` | `#5546E0` |                                             |
| `--accent-text`  | `#A99FFF` | `#5546E0` | Accent-coloured text and icons on surfaces  |
| `--on-accent`    | `#FFFFFF` | `#FFFFFF` | Text on accent fills                        |
| `--success`      | `#34D17A` | `#15803D` | Correct guess, "guessed" state              |
| `--warning`      | `#F5B041` | `#B45309` | Close guess, last ten seconds               |
| `--danger`       | `#F26D6D` | `#B91C1C` | Errors, kick, time up                       |
| `--info`         | `#5CC3F5` | `#0369A1` | Neutral system notices                      |

Rules:

- Text and icon colours meet WCAG 2.1 AA against the surface they sit on (4.5:1 for body text, 3:1 for large text and UI glyphs). An automated check enforces this (spec 011).
- Semantic colour always comes with an icon or text. A guessed player has a check mark, not only a green name.
- Accent is for one primary action per view and for selection. It is never a background for large areas.

### Canvas and drawing palette

The canvas is paper: `#FFFFFF` in both themes, so a drawing looks identical for everyone. It sits on the surface with a 1 px border and the large shadow.

Avatar bodies use a fixed set of twelve colours (`--avatar-body-0` … `--avatar-body-11` in the token file), chosen to stay distinguishable on both themes.

The drawing palette has 24 colours, shown as three rows of eight:

| Row   | Colours                                                                         |
| ----- | ------------------------------------------------------------------------------- |
| Light | `#FFFFFF` `#D4D7E0` `#FFD9B8` `#FFB3C7` `#FFE873` `#9BDB4D` `#4DB8FF` `#9B5DE5` |
| Mid   | `#8B90A3` `#4A4E5E` `#E0A070` `#FF6FAE` `#FFC53D` `#2FB56A` `#2F6BFF` `#5B4BDB` |
| Deep  | `#14151C` `#4E3222` `#8A5A3C` `#E5383B` `#FF8A3D` `#1E6B45` `#1FA6A0` `#1D2A6B` |

A "custom colour" swatch opens the native colour picker. The default brush is `#14151C`, size 8.

## 4. Typography

All fonts are bundled with the app (variable fonts, SIL Open Font License); nothing is loaded from a font CDN.

| Role      | Typeface            | Use                                     |
| --------- | ------------------- | --------------------------------------- |
| Display   | Bricolage Grotesque | Wordmark, screen titles, podium numbers |
| Interface | Inter               | Everything else                         |
| Mono      | JetBrains Mono      | Word mask, room code, timer digits      |

| Token        | Size / line height | Weight | Use                                |
| ------------ | ------------------ | ------ | ---------------------------------- |
| `display`    | 48 / 52            | 700    | Home wordmark                      |
| `title`      | 32 / 38            | 700    | Screen titles, revealed word       |
| `heading`    | 24 / 30            | 600    | Panel headings                     |
| `subheading` | 18 / 26            | 600    | Card titles, mask on phones        |
| `body`       | 16 / 24            | 400    | Default text, chat                 |
| `label`      | 14 / 20            | 500    | Buttons, form labels, player names |
| `caption`    | 12 / 16            | 500    | Metadata, hints                    |

The mask uses mono at `heading` size with 0.3 em letter spacing; word gaps are rendered as a wider space. Timer digits use tabular numbers.

## 5. Space, shape, depth

- **Spacing scale:** 4 px base: 4, 8, 12, 16, 24, 32, 48, 64. Panels use 16 px padding on phones and 24 px from tablet width.
- **Radii:** `sm` 6 (inputs, chips), `md` 10 (buttons), `lg` 16 (cards, canvas), `xl` 24 (modals), `full` (avatars, pills).
- **Borders:** 1 px `--border`. Panels are defined by border and surface colour first, shadow second.
- **Shadows:** `sm` for raised controls, `md` for popovers, `lg` for modals and the canvas. In the dark theme shadows are subtle; elevation is carried by the lighter surface token.
- **Focus:** 2 px `--accent` ring with 2 px offset on every interactive element, visible in both themes.

## 6. Motion

| Token  | Duration | Easing                         | Use                                  |
| ------ | -------- | ------------------------------ | ------------------------------------ |
| `fast` | 120 ms   | ease-out                       | Hover, press, toggles                |
| `base` | 200 ms   | ease-out                       | Panels, popovers, chat message enter |
| `slow` | 320 ms   | cubic-bezier(0.2, 0.8, 0.2, 1) | Overlays, phase transitions          |
| `pop`  | 400 ms   | spring (overshoot ≤ 8 %)       | Correct guess, score deltas, podium  |

- Motion explains a change (who guessed, whose turn); it never decorates idle screens.
- Confetti appears once, on the results screen, for at most three seconds.
- Reactions float up from the bottom of the canvas for 1.6 s and fade.
- With `prefers-reduced-motion`, transitions become opacity-only fades of 120 ms, and confetti and floating reactions are replaced by static equivalents.

## 7. Sound

Seven short effects, synthesised with the Web Audio API (no audio files): join, your turn, correct guess (yours), correct guess (someone else), tick for each of the last ten seconds, turn end, win. Default volume is moderate; a single mute toggle in the top bar is remembered. Sound never carries information that is not also visible.

## 8. Components

Each component lives in `apps/web/src/ui`, supports both themes, keyboard use and the focus ring, and has a disabled and (where it can load) a busy state.

| Component                  | Notes                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Button**                 | Variants: primary (accent fill), secondary (surface with border), ghost, danger. Sizes: `md` 40 px, `lg` 48 px. Minimum touch target 44 × 44 px. |
| **IconButton**             | Square, always with an accessible label and a tooltip.                                                                                           |
| **Input / Textarea**       | Overlay surface, border, label above, error text below.                                                                                          |
| **Segmented control**      | For choices of two to five (language, difficulty, theme).                                                                                        |
| **Stepper / Slider**       | Numeric settings (rounds, draw time) show the value next to the control.                                                                         |
| **Card / Panel**           | Raised surface, `lg` radius, optional header row.                                                                                                |
| **Avatar**                 | Circular, sizes 28, 40, 64, 120 px. Rendered from parts (spec 010).                                                                              |
| **PlayerRow**              | Rank, avatar, name, score, state badges: drawer (pencil), guessed (check), disconnected (dimmed with a plug icon), host (crown).                 |
| **ChatMessage**            | Variants: chat, system, correct (success tint), close (warning tint, private), guessed-channel (accent left border).                             |
| **WordMask**               | Mono letters and blanks with letter count; revealed letters animate in with `pop`.                                                               |
| **TimerRing**              | Circular countdown with digits; turns to `--warning` and pulses at ten seconds.                                                                  |
| **Toolbar**                | Tools, sizes, palette, undo, redo, clear. Selected tool and colour are marked by ring and shape, not only colour.                                |
| **Toast**                  | Bottom-centre, auto-dismiss after 4 s, at most one visible.                                                                                      |
| **Modal**                  | Centred, `xl` radius, traps focus, closes on Escape. Becomes a bottom sheet on phones.                                                           |
| **Tooltip**                | On hover and focus, 400 ms delay.                                                                                                                |
| **Empty and error states** | A line of text and one action; no illustrations required.                                                                                        |

Icons come from one bundled outline icon set (Lucide), 20 px at 1.75 stroke in controls.

## 9. Screens

### Home

Centred column, maximum width 480 px: wordmark, a one-line promise ("Draw. Guess. No ads."), the identity card (avatar with a randomise button, nickname field), then three actions: **Create room** (primary), **Join with code** (secondary, expands to a code field), **Play solo** (secondary). Top right: language switch, theme toggle. Footer: "Open source", link to the repository, version.

### Lobby

Two columns from 1024 px. Left: invite card with the room code in mono and a **Copy link** button, then the player grid (avatar tiles, host crown, empty seats shown as dashed outlines). Right: settings panel, editable for the host and read-only with a "Only the host can change settings" caption for others. Bottom: **Start game** (host; disabled with a reason below two players) or "Waiting for the host…".

### Game

| Width       | Layout                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1280 px   | Top bar across. Three columns below: scoreboard (240 px), canvas with toolbar (fluid), chat (320 px).                                                                                                                                 |
| 640–1279 px | Top bar. Canvas full width with toolbar. Below it, scoreboard and chat side by side.                                                                                                                                                  |
| < 640 px    | Compact top bar. Canvas full width. Toolbar as one scrollable row (drawer only). Chat fills the rest; the scoreboard collapses into a horizontal avatar strip that expands on tap. The chat input stays above the on-screen keyboard. |

The top bar shows: round "2 / 3", the mask (or the word for the drawer, or the word choices during choosing), the timer ring, and the mute, theme and leave controls.

The canvas keeps its 4:3 ratio at every size. Guessers see a thin caption under it with the drawer's avatar and name. The reaction bar and like buttons sit at the canvas's bottom edge for non-drawers.

Overlays on the canvas area, never full screen: word choice (three large buttons with a countdown bar), "_Name_ is choosing a word…", turn end (the word, a scaled-down drawing, point deltas per player).

### Results

Podium for the top three (avatars at 120 px, display-font ranks, score count-up), full ranking below, then the gallery grid: each drawing as a card with word, drawer, like count and a download button. Host action: **Play again**. Everyone: **Leave**.

### Solo

Same top bar and canvas as the game screen, a guess input instead of the chat, progress dots "4 / 10", **Skip** button. The summary shows the score, personal best and the ten drawings with their words. Footer credit for the dataset.

## 10. Accessibility

- Every control is reachable and operable by keyboard in a logical order; the chat input is focused by default for guessers.
- Chat and system messages are an `aria-live="polite"` log; the timer announces at 30 and 10 seconds; turn changes are announced.
- Touch targets are at least 44 × 44 px; drawing uses pointer events with `touch-action: none` on the canvas only.
- Text scales with the browser's font size up to 200 % without loss of function.
- Freehand drawing needs a pointer; this limitation is stated in the README. Guessing, hosting and solo play are fully keyboard accessible.

## 11. Copy and localisation

- Strings are written in English first and translated to German, Spanish and French as natural phrases, not word for word.
- Layouts tolerate text 40 % longer than English; buttons wrap rather than truncate.
- Numbers, plurals and ordinals use `Intl` APIs for the active language.
- Words to draw are shown in the room's word language, independent of each player's interface language.
