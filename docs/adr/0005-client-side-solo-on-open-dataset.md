# Solo mode replays an open drawing dataset in the browser

For "play against the computer" we replay human drawings from Google's Quick, Draw! dataset (CC BY 4.0), curated to a few megabytes and committed to the repository, and we run the whole solo mode in the browser.

This gives a solo mode with no API key, no running costs and no outbound requests, which the self-hosting goal requires. The word set for solo is limited to the dataset's categories, and the answer is technically visible to anyone who inspects the page; in a single-player mode with a local personal best that is harmless.

## Considered options

- **A hosted language or image model draws and guesses**: richer, but needs a key, costs money per game and sends data to a third party.
- **Server-run solo rooms**: hides the answer, but spends server resources and complexity on protecting a score nobody else sees.
- **Download the dataset at build time**: keeps the repository smaller, but makes builds depend on the network.

## Consequences

- `NOTICE.md` must carry the dataset attribution, and the solo screen links to it.
- The computer guessing the player's drawing needs a recognition model and is specified separately (spec 101).
