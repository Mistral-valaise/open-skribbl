# Drawings are op logs rendered with the Canvas API

A drawing is transmitted and stored as an ordered log of ops (strokes, fills, clears, undo, redo) in a fixed 800 × 600 logical coordinate space, and every client renders that log with the browser's Canvas 2D API. The op log gives us cheap live sync, exact undo, late join, gallery, PNG export at any resolution and the solo replay from one representation.

Rendering with the Canvas API means anti-aliased edges differ by a few pixels between browsers, so a flood fill can cover a marginally different area on two machines. We accept that: fills use a colour tolerance and grow by one pixel to close the anti-aliasing fringe.

## Considered options

- **Bitmap sync** (send pixels or tiles): identical on all clients, but heavy on bandwidth and useless for undo, replay and bots.
- **Own deterministic rasteriser in `shared`**: pixel-identical everywhere, but strokes would be aliased or we would maintain an anti-aliasing rasteriser ourselves. Rejected as disproportionate.
