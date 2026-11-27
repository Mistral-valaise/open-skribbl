# 010 — Identity and avatars

|           |          |
| --------- | -------- |
| Status    | Proposed |
| Milestone | M2       |

## Intent

Players should recognise each other at a glance without creating accounts or uploading anything. A nickname and a small, expressive avatar are the whole identity, and they live only in the player's browser.

## Behaviour

- On the home screen and on the join form the player sees their avatar and nickname, prefilled from their last visit. A first-time visitor gets a random avatar and an empty nickname field.
- The avatar builder cycles through body colours, eyes, mouths and accessories with previous/next controls; a dice button randomises everything.
- Nickname and avatar are sent when joining and are shown wherever the player appears: lobby, scoreboard, chat, turn end, results, gallery.

## Rules

### Nickname

- Trimmed, inner whitespace collapsed to single spaces; 1–16 characters.
- Allowed: letters and digits of any script, space, `_`, `-`, `.`.
- If the nickname is already taken in the room (compared case-insensitively), the server appends the lowest free number from 2: "Mara", "Mara 2", "Mara 3".
- An invalid nickname rejects the join with `invalid_nickname`.

### Avatar

- An avatar is four indices: `body` 0–11, `eyes` 0–7, `mouth` 0–7, `accessory` 0–7 (0 is none). Values outside these ranges reject the join with `invalid_avatar`.
- Avatars are drawn from bundled SVG parts created for this project, on a circular background in the body colour. They look correct in both themes and are distinguishable at 28 px.
- Body colours are a fixed set of twelve defined in the design tokens.

### Storage

- Nickname, avatar and a random `clientId` are stored in `localStorage` and never leave the browser except in the `join` message.
- The server keeps them only as part of the seat, for the life of the room.

### Accessibility

- Every builder control has a text label ("Next eyes"); the avatar itself has the alternative text "Avatar of _nickname_".

## Acceptance criteria

- **AC-010-01** Nicknames `"  Mara  "`, `"Mara   K"` and `"José_99"` are accepted as "Mara", "Mara K" and "José_99".
- **AC-010-02** An empty nickname, one of 17 characters, and `"<Mara>"` are each rejected with `invalid_nickname`.
- **AC-010-03** When "Mara" is seated, a join as "mara" is seated as "mara 2", and a further join as "MARA" as "MARA 3".
- **AC-010-04** An avatar with `eyes` 8 or a non-integer index is rejected with `invalid_avatar`.
- **AC-010-05** A first visit shows a randomly generated valid avatar; the dice button produces a different valid avatar.
- **AC-010-06** Each previous/next control changes exactly one part and wraps around at the ends of its range.
- **AC-010-07** Nickname and avatar chosen on one visit are prefilled on the next visit in the same browser.
- **AC-010-08** A participant's avatar and nickname shown to other participants equal the ones that participant chose.
- **AC-010-09** Every one of the 12 × 8 × 8 × 8 combinations renders without error.
- **AC-010-10** Every builder control is operable by keyboard and has an accessible name.

## Out of scope

Uploaded images, drawing your own avatar, accounts, changing nickname or avatar while seated in a room.
