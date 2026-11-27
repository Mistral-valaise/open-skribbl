# Promo film

A 31-second film about Kritzel, 1920 × 1080, silent, in English. The rendered file is [`dist/kritzel-promo.mp4`](dist/kritzel-promo.mp4); a release attaches it as an asset. The short loop at the top of the repository's README is cut from it.

Everything on screen that shows the game is a recording of a real game. Nothing is mocked or redrawn: `scripts/readme-media.mjs` starts the server, plays a game in four browsers and records what they show.

## Files

| File                     | Content                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `index.html`             | The film: nine scenes on one timeline                                         |
| `compositions/*.html`    | One scene each                                                                |
| `assets/fonts/`          | Bricolage Grotesque, the display typeface of the game (SIL Open Font License) |
| `assets/clips/`          | The recorded footage. Not in the repository; recorded as described below      |
| `retime.mjs`             | Fits the trims and speeds of the scenes to a new recording                    |
| `STORYLINES.md`          | The three storylines that were considered                                     |
| `SPEC.md`                | The brief of the one that was built: look, motion and shots, in numbers       |
| `REVIEW.md`              | What was checked before the render, and what was not                          |
| `dist/kritzel-promo.mp4` | The rendered film                                                             |

## Rebuild it

The film is made with [HyperFrames](https://hyperframes.heygen.com), which renders HTML to video frame by frame; it needs Node.js, ffmpeg and a network connection for its own download and for GSAP, which the compositions load from a CDN at render time. None of this is part of the game or its image.

Record the footage (about three minutes; needs `pnpm install` and ffmpeg):

```bash
node scripts/readme-media.mjs --clips marketing/promo/assets/clips
```

A new recording has slightly different timings, and scores that differ by a few points. Fit the scenes to it:

```bash
node marketing/promo/retime.mjs
```

Check, look at it, render:

```bash
cd marketing/promo && npm run check
```

```bash
cd marketing/promo && npm run dev
```

```bash
cd marketing/promo && npm run render -- --output dist/kritzel-promo.mp4 --quality delivery --video-frame-format png
```

The preview loop of the repository's README is the first twelve seconds of the film as a GIF:

```bash
ffmpeg -t 12.1 -i marketing/promo/dist/kritzel-promo.mp4 -vf "fps=12,scale=840:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -loop 0 docs/assets/readme/preview.gif
```
