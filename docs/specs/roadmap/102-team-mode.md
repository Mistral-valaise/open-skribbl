# 102 — Team mode

|           |          |
| --------- | -------- |
| Status    | Draft    |
| Milestone | after v1 |

## Intent

Larger groups enjoy playing department against department. In team mode two teams compete: a team scores when its members guess its own drawer's word.

## Behaviour (intended)

- The host enables team mode in the lobby. Players are split into two named, coloured teams, by shuffle or by choosing a side.
- Teams take turns providing the drawer. Only the drawer's teammates can guess; the other team watches, and may get a chance to steal with a single guess after time runs out.
- The scoreboard shows team totals first and individual contributions second. The results screen crowns a team.

## Open questions

1. Does the opposing team get a steal, and for how many points?
2. Are team sizes forced to be balanced, and what happens with an odd number of players or a late join?
3. Is chat split per team during a turn, in addition to the guessed channel?
4. Do individual scores still exist and rank within the team?
5. How does team mode combine with bots (spec 101)?

## Impact

Changes specs 002 (turn order alternates between teams), 004 (who may guess, channel visibility), 005 (team scoring) and the scoreboard, turn-end and results screens in the design guideline.

## Out of scope

More than two teams, tournaments, persistent teams across rooms.
