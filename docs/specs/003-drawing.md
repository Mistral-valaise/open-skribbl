# 003 — Drawing

|           |          |
| --------- | -------- |
| Status    | Approved |
| Milestone | M1       |

## Intent

Drawing has to feel immediate for the drawer and look the same for everyone, on a mouse, a finger or a stylus. The drawing is also data the rest of the product reuses: late join, gallery, export and solo replay.

## Behaviour

- During the drawing phase the drawer sees a toolbar: brush, eraser, fill, five sizes, the colour palette with a custom-colour picker, undo, redo and clear.
- The drawer's own strokes appear instantly; everyone else sees them appear while they are being drawn.
- Undo removes the most recent stroke, fill or clear; redo restores it. Clear empties the canvas and can itself be undone.
- Participants who join or reconnect during a turn see the drawing as it currently is.
- Nobody but the drawer can change the canvas, and the drawer can change it only during the drawing phase.

## Rules

### Canvas

- Logical size 800 × 600. Coordinates are integers in `0…800` × `0…600`.
- Background `#FFFFFF`. The canvas keeps its 4:3 ratio at every display size.

### Ops

| Op              | Fields                                                        | Meaning                             |
| --------------- | ------------------------------------------------------------- | ----------------------------------- |
| `stroke.start`  | `id`, `tool` (`brush` \| `eraser`), `color`, `size`, `x`, `y` | Begins a stroke                     |
| `stroke.points` | `id`, `points` (flat `[x, y, x, y, …]`)                       | Extends the stroke                  |
| `stroke.end`    | `id`                                                          | Finishes the stroke                 |
| `fill`          | `x`, `y`, `color`                                             | Flood-fills the region at the point |
| `clear`         | —                                                             | Empties the canvas                  |
| `undo`          | —                                                             | Removes the latest effective item   |
| `redo`          | —                                                             | Restores the latest undone item     |

- `size` is one of `4, 8, 14, 24, 40`. `color` is a `#RRGGBB` string. The eraser paints `#FFFFFF`.
- A stroke with a single point renders as a dot of the stroke's size.
- Strokes render with round caps and round joins.

### Op log

- The server keeps the turn's op log and derives the **effective items** (strokes, fills, clears, in order) from it.
- `undo` moves the last effective item to the redo stack; `redo` moves it back. Any new stroke, fill or clear empties the redo stack. `undo` on an empty canvas and `redo` on an empty stack are no-ops.
- An unfinished stroke is ended automatically when the drawer disconnects or the turn ends.

### Fill

- Flood fill from the target pixel over 4-connected pixels whose colour is within a per-channel tolerance of 32 of the target pixel's colour, then grown by one pixel.
- A fill whose target pixel already has the fill colour is a no-op and is not added to the log.

### Capture

- Pointer events (mouse, touch, pen); only the primary pointer draws.
- The client drops points closer than 2 logical pixels to the previous one and sends batched points every 33 ms.

### Limits

| Limit                    | Value   |
| ------------------------ | ------- |
| Points per stroke        | 5,000   |
| Effective items per turn | 2,000   |
| Total points per turn    | 200,000 |

An op that would exceed a limit is rejected with `drawing_limit`; the drawer sees a toast.

### Shortcuts (drawer only, when the chat input is not focused)

`B` brush · `E` eraser · `F` fill · `1`–`5` size · `Ctrl/Cmd+Z` undo · `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` redo.

## Acceptance criteria

- **AC-003-01** A `draw.op` from the drawer in the drawing phase is relayed to every other participant and appended to the op log.
- **AC-003-02** A `draw.op` from anyone but the drawer, or outside the drawing phase, is rejected with `not_allowed` and neither relayed nor logged.
- **AC-003-03** An op with a coordinate outside the canvas, a size not in the allowed set, or a malformed colour is rejected and not relayed.
- **AC-003-04** Reducing the log `[stroke A, stroke B, undo]` yields the effective items `[A]`; adding `redo` yields `[A, B]`.
- **AC-003-05** Reducing `[stroke A, undo, stroke C, redo]` yields `[C]`: a new item empties the redo stack.
- **AC-003-06** Reducing `[stroke A, clear, undo]` yields `[A]`: clear is undoable.
- **AC-003-07** `undo` with no effective items and `redo` with an empty redo stack leave the effective items unchanged.
- **AC-003-08** A participant who joins during the drawing phase receives the op log in `joined` and renders the same effective items as the others.
- **AC-003-09** When the turn ends while a stroke is unfinished, the stored op log contains that stroke as finished.
- **AC-003-10** A stroke that would exceed 5,000 points, or an item beyond 2,000 per turn, is rejected with `drawing_limit`.
- **AC-003-11** A fill on a blank canvas colours every pixel; a fill inside a closed outline leaves the pixels outside the outline unchanged.
- **AC-003-12** A fill whose target pixel already has the fill colour adds nothing to the op log.
- **AC-003-13** A press-and-release without movement renders a dot with the diameter of the selected size.
- **AC-003-14** Drawing with touch input on a phone-sized viewport produces a stroke and does not scroll the page.
- **AC-003-15** The shortcuts select the tool and size, undo and redo; they do nothing while the chat input has focus.
- **AC-003-16** The toolbar is visible only to the drawer and only in the drawing phase.
- **AC-003-17** At the start of each turn the op log is empty and every participant's canvas is blank.

## Out of scope

Shape tools, layers, text, images, pressure sensitivity, selecting or moving strokes, drawing by keyboard.
