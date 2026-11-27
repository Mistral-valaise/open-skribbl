# Single process, all state in memory

Kritzel is built for one team on one small server, and the owner wants hosting to be a single `docker run`. We keep every room in the memory of one Node process and add no database, cache or message bus. A restart ends running games and one instance is the scaling limit; both are accepted, because a persistent or distributed design would add operational parts that the target user would have to run and secure.

## Considered options

- **Redis-backed rooms with several instances**: survives restarts and scales out, but needs a second service and sticky routing. Rejected for v1.
- **SQLite for room snapshots**: survives restarts, but stores player data on disk, which contradicts the privacy goal.

## Consequences

- Room state must stay small and bounded (op-log and chat limits), since memory is the only store.
- Anything that looks like history (statistics, saved galleries) lives in the player's browser or is out of scope.
