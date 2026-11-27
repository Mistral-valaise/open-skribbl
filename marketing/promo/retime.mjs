#!/usr/bin/env node
// Fits the film to freshly recorded clips. `scripts/readme-media.mjs --clips`
// writes a JSON file of named moments next to each clip; a new recording has
// slightly different timings, and this script rewrites the trims and speeds
// in `compositions/` so every shot still shows what `SPEC.md` says.
//
// Usage: node marketing/promo/retime.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const moments = (clip) => JSON.parse(readFileSync(here(`assets/clips/${clip}.json`), 'utf8'));
const draw = moments('draw');
const phone = moments('phone');
const languages = moments('languages');
const podium = moments('podium');

const round = (value) => Number(value.toFixed(2));

/** Sets attributes on the element with the given id. */
function retime(file, id, attributes) {
  const path = here(`compositions/${file}.html`);
  let html = readFileSync(path, 'utf8');
  const tag = new RegExp(`<[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0];
  if (!tag) throw new Error(`${file}.html has no element #${id}`);
  let changed = tag;
  for (const [name, value] of Object.entries(attributes)) {
    const attribute = new RegExp(`${name}="[^"]*"`);
    if (!attribute.test(changed)) throw new Error(`#${id} has no ${name}`);
    changed = changed.replace(attribute, `${name}="${round(value)}"`);
  }
  html = html.replace(tag, changed);
  writeFileSync(path, html);
  console.log(`#${id}`, attributes);
}

// Hook: from a tower that is half drawn to the finished beams, in the shot's 5.4 s.
const hookFrom = draw.drawing + 0.8;
const hookTo = draw.beams + 0.15;
retime('hook', 'hook-footage', {
  'data-media-start': hookFrom,
  'data-playback-rate': (hookTo - hookFrom) / 5.4,
});

// Result: on from there until just after the first right guess, then the turn-end card.
retime('result', 'result-a', {
  'data-media-start': hookTo,
  'data-playback-rate': (draw.guess + 0.9 - hookTo) / 2.2,
});
retime('result', 'result-b', { 'data-media-start': draw['turn-end'] + 0.9 });

// Screens: the phone and the desktop were recorded together; both show the drawing grow.
const screens = { 'data-media-start': 3, 'data-playback-rate': (phone.duration - 0.6 - 3) / 3.4 };
retime('screens', 'screens-phone-footage', screens);
retime('screens', 'screens-desktop-footage', screens);

// Languages: the inked name follows the switches of the recording.
const languageFrom = 0.4;
const languageRate = 2.2;
retime('languages', 'languages-footage', {
  'data-media-start': languageFrom,
  'data-playback-rate': languageRate,
});
const order = ['en', 'de', 'es', 'fr', 'en'];
const switches = order
  .slice(1)
  .map(
    (to, index) =>
      `        ['${order[index]}', '${to}', ${round((languages[to] - languageFrom) / languageRate)}],`,
  );
const path = here('compositions/languages.html');
const before = readFileSync(path, 'utf8');
const after = before.replace(
  /const LANGUAGE_SWITCHES = \[[\s\S]*?\];/,
  `const LANGUAGE_SWITCHES = [\n${switches.join('\n')}\n      ];`,
);
if (after === before && !before.includes(switches[0])) {
  throw new Error('languages.html has no LANGUAGE_SWITCHES to set');
}
writeFileSync(path, after);

// Podium: a moment before the results appear.
retime('podium', 'podium-footage', { 'data-media-start': podium.results - 0.2 });
