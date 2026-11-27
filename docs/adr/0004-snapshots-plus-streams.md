# Room state is synced by full snapshots, drawing and chat by streams

After every change the server sends each participant a complete snapshot of the room as that participant may see it. Drawing ops, chat messages and reactions are relayed as individual messages.

Snapshots trade a little bandwidth for the removal of a whole class of bugs: there are no client-side reducers to keep in step with the server, and reconnect and late join are the same code path as any other update. A room has at most twelve players and the snapshot excludes drawing data, so it stays in the low kilobytes. Drawing and chat are append-only and frequent, where per-item messages are the natural fit.

## Considered options

- **Granular events for everything**: least bandwidth, but duplicates rule logic on the client and makes resynchronisation a special case.
- **State patches (JSON Patch or CRDT)**: efficient, but more machinery than rooms of this size justify.
