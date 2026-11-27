# 006 — Words and languages

|           |          |
| --------- | -------- |
| Status    | Proposed |
| Milestone | M2       |

## Intent

Kritzel is played by mixed teams in English, German, Spanish and French. The interface language is each participant's own choice; the language of the words is the room's choice. Word lists are plain files the community can improve.

## Behaviour

- The interface appears in the browser's language when it is English, German, Spanish or French, otherwise in English. A switch on every screen changes it at once; the choice is remembered.
- The host picks the room's word language and difficulty in the lobby. Each participant keeps their own interface language.
- The host can paste custom words. They are mixed with the built-in list, or used exclusively with **Use only custom words**.
- During the drawing phase guessers see the mask with the number of letters, and hints reveal letters over time.

## Rules

### Interface languages

- `en`, `de`, `es`, `fr`. Detection uses the first entry of `navigator.languages` whose primary subtag matches; the stored choice wins.
- Every visible string comes from the dictionary of the active language. `en` defines the keys; `de`, `es` and `fr` contain exactly the same keys.
- From M1 on, all interface text goes through the dictionary, even while only English exists.
- System messages are sent as key plus parameters and rendered in the recipient's language.

### Word lists

- Location: `packages/content/words/<lang>/{easy,medium,hard}.txt`. UTF-8, NFC, one word per line; lines starting with `#` and blank lines are ignored.
- A word has 1–30 characters and consists of letters, digits, spaces, hyphens and apostrophes.
- Within a language no two words are equal after normalisation (spec 004).
- Each list contains at least 200 words. Difficulty: `easy` is concrete everyday objects and animals; `medium` adds activities, places and less common objects; `hard` adds abstract ideas, compound concepts and professions.
- Words are original selections for this project, family-friendly, and free of brands and living persons.
- M1 ships an English starter list of at least 100 words per difficulty.

### Word selection

- The pool is the built-in list for the room's language and difficulty (`mixed` is the union of all three) plus the custom words; with `customWordsOnly` it is the custom words alone.
- For each choice slot: if unused custom words remain and `customWordsOnly` is off, the slot is filled from the custom words with probability 0.5, otherwise from the built-in pool.
- Choices within one offer are distinct, and no word repeats within a game while unused words remain (spec 002). When the pool is exhausted, used words become available again.

### Custom words

- Entered as text, separated by commas or line breaks; each entry is trimmed; entries that are equal after normalisation are merged.
- At most 500 words, each valid as defined above; invalid entries reject the update with `invalid_custom_words` and the offending entries are named.
- `customWordsOnly` requires at least 10 custom words.
- Custom words are visible only to the host.

### Mask

- The mask has one position per character of the word. Letters and digits are hidden as `_`; spaces, hyphens and apostrophes are shown as they are.
- The interface shows the letter count per written word, for example `_ _ _   _ _ _ _ _  (3, 5)`.

### Hints

- Let `L` be the number of hidden positions and `H` the `hints` setting. The turn has `h = min(H, floor((L − 1) / 2))` hints.
- Hint `i` (1…h) is revealed when `drawTime × i / (h + 1)` of the drawing time has elapsed.
- Each hint reveals one hidden position chosen at random; the revealed character is shown with its original capitalisation.
- Hints are visible to guessers through the mask in their snapshot. Revealing hints does not change points.

Example: "lighthouse" (`L` = 10) with `hints` 2 and `drawTime` 80 s reveals one letter at 26.7 s and one at 53.3 s.

## Acceptance criteria

- **AC-006-01** With browser languages `["de-AT", "en"]` and no stored choice, the interface starts in German; with `["fr-CA"]` it starts in French; with `["it"]` it starts in English.
- **AC-006-02** Switching the language updates every visible string without a reload and survives a reload.
- **AC-006-03** The `de`, `es` and `fr` dictionaries have exactly the keys of `en`; a missing or extra key fails the type check.
- **AC-006-04** Two participants with different interface languages each read the same system message in their own language.
- **AC-006-05** Every word-list file passes validation: character set, length, no duplicates after normalisation within its language, at least 200 words.
- **AC-006-06** With word language `de` and difficulty `easy`, every offered word comes from `words/de/easy.txt` or from the custom words.
- **AC-006-07** With difficulty `mixed`, offered words are drawn from the union of the three lists of the room's language.
- **AC-006-08** With `customWordsOnly` and 12 custom words, every offered word is a custom word.
- **AC-006-09** Enabling `customWordsOnly` with fewer than 10 custom words is rejected with `invalid_custom_words`.
- **AC-006-10** Custom-word input `"Cat, dog\n cat ,  Müller-Lüdenscheidt"` results in three words: duplicates after normalisation are merged and entries are trimmed.
- **AC-006-11** A custom-words update with more than 500 entries, or with an entry longer than 30 characters, is rejected and changes nothing.
- **AC-006-12** Snapshots of non-host participants do not contain the custom words; they contain their count.
- **AC-006-13** The mask of "ice cream" is `___ _____`, and the interface shows the letter counts 3 and 5.
- **AC-006-14** The mask of "T-Shirt" shows the hyphen and hides six positions.
- **AC-006-15** For "lighthouse" with `hints` 2 and `drawTime` 80 s, the mask has one revealed letter after 27 s and two after 54 s, and none before 26 s.
- **AC-006-16** For a three-letter word with `hints` 5 exactly one letter is revealed during the turn; for a two-letter word none.
- **AC-006-17** With `hints` 0 the mask never reveals a letter.
- **AC-006-18** A revealed position shows the word's character at that position, and a position once revealed stays revealed.
- **AC-006-19** The words offered and the mask are in the room's word language regardless of the drawer's interface language.

## Out of scope

More than four languages in v1, per-player word language, importing word lists from files or URLs, sharing custom word sets between rooms.
