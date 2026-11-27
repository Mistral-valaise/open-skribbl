# 004 — Guessing and chat

|           |          |
| --------- | -------- |
| Status    | Approved |
| Milestone | M1       |

## Intent

Guessing happens in the chat, so the chat is both the game's input and its social space. The server must recognise a correct guess generously, never leak the word, and keep the conversation alive for those who already know it.

## Behaviour

- There is one input. During the drawing phase a guesser's message is a guess; at any other time, and for anyone else, it is chat.
- **Correct guess:** the message is not shown to anyone. Everyone sees "_Name_ guessed the word"; the guesser sees the word and their points.
- **Wrong guess:** the message appears in the chat for everyone.
- **Close guess:** the message appears like any wrong guess, and the guesser alone also sees "_word_ is close".
- After guessing, a player keeps chatting in the **guessed channel**, readable only by the drawer and the others who have guessed. Messages there are visually distinct.
- When the turn ends, everyone sees "The word was _word_" and chat is common again.

## Rules

### Message handling during the drawing phase

| Sender                                   | Handling                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Guesser who has not guessed              | Checked against the word: correct → swallowed and scored; otherwise broadcast on `all` (plus a private close notice if close). |
| Player who has guessed                   | Sent on `guessed`.                                                                                                             |
| Drawer                                   | Sent on `guessed`.                                                                                                             |
| Spectator, or player who joined mid-turn | Broadcast on `all`, unless the text is correct or close, in which case it is dropped and the sender sees `message_blocked`.    |

Outside the drawing phase every message is broadcast on `all`.

### Channel visibility

- `all`: everyone in the room.
- `guessed`: the drawer and players who have guessed in the current turn. A player who guesses later does not receive earlier `guessed` messages.

### Text

- Trimmed; 1–100 characters; longer or empty messages are rejected.
- Rendered as plain text.

### Matching

Both the word and the guess are **normalised**, then compared.

1. Unicode NFKC, lower-cased.
2. Every character that is not a letter or a digit is removed (spaces, hyphens, apostrophes, punctuation).
3. Ligatures are written out: `œ→oe`, `æ→ae`.
4. Two foldings are produced:
   - **plain:** diacritics removed (`é→e`, `ñ→n`, `ü→u`, `ç→c`), `ß→ss`.
   - **digraph:** `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`, then remaining diacritics removed.

A guess is **correct** when any folding of the guess equals any folding of the word.

Examples: for the word "Tür", the guesses "tür", "TUR" and "tuer" are correct. For "ice cream", "icecream" and "Ice-Cream" are correct. For "niño", "nino" is correct. For "cœur", "coeur" is correct.

### Close guess

A guess that is not correct is **close** when the smallest Levenshtein distance between any folding of the guess and any folding of the word is:

| Word length (plain folding) | Close when distance is |
| --------------------------- | ---------------------- |
| under 4                     | never                  |
| 4–7                         | 1                      |
| 8 or more                   | 1 or 2                 |

### System messages

System messages carry an i18n key and parameters, so each participant reads them in their own interface language: joined, left, guessed, turn ended (with the word), new host, kicked.

## Acceptance criteria

- **AC-004-01** A correct guess is not delivered as a chat message to any participant; all participants receive the system message that the player guessed, and the guesser receives `guess.feedback` `correct`.
- **AC-004-02** A wrong guess is delivered on `all` to every participant with the sender's id and text.
- **AC-004-03** For the word "Tür", the guesses "tür", "TUR", " tuer " and "Tü-r" are all correct.
- **AC-004-04** For the word "ice cream", "icecream" and "Ice-Cream" are correct; for "niño", "nino" and "NIÑO" are correct; for "Straße", "strasse" is correct.
- **AC-004-05** For the word "house" (length 5), "horse" is close and "hose" is close; "mouse" is close; "home" is not close.
- **AC-004-06** For a three-letter word no guess is ever close.
- **AC-004-07** For the word "lighthouse" (length 10), a guess at distance 2 is close and a guess at distance 3 is not.
- **AC-004-08** A close guess is broadcast on `all` like any wrong guess, and only the sender receives `guess.feedback` `close`.
- **AC-004-09** After guessing, a player's messages are delivered only to the drawer and to players who have guessed; a guesser who has not guessed receives none of them.
- **AC-004-10** The drawer's messages during the drawing phase are delivered on `guessed` only.
- **AC-004-11** A player who has guessed cannot score again in the same turn: sending the word again delivers it on `guessed` and awards nothing.
- **AC-004-12** A spectator's message that is correct or close is delivered to nobody and the spectator receives `message_blocked`; any other spectator message is delivered on `all`.
- **AC-004-13** Outside the drawing phase, a message from any participant is delivered on `all`, even if it equals the previous word.
- **AC-004-14** A message that is empty after trimming or longer than 100 characters is rejected with `invalid_message`.
- **AC-004-15** When a turn ends, every participant receives a system message containing the word.
- **AC-004-16** A message containing `<b>hi</b>` is displayed literally as text.
- **AC-004-17** A sixth message within one second from the same participant is dropped with `rate_limited`.
- **AC-004-18** For a guesser in the drawing phase the chat input is focused when the phase starts, and Enter sends the message and keeps focus.
- **AC-004-19** For the word "cœur", "coeur" and "CŒUR" are correct; for "garçon", "garcon" is correct; for "arc-en-ciel", "arc en ciel" is correct; for "feu d'artifice", "feu dartifice" is correct.

## Out of scope

Private messages, message editing or deletion, emoji picker, profanity filtering, chat history for participants who join later.
