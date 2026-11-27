# Security policy

## Supported versions

Fixes are made for the latest release and published as a new release. Older releases are not patched: update to the latest one.

| Version                             | Supported                                    |
| ----------------------------------- | -------------------------------------------- |
| The latest release (`latest`)       | Yes                                          |
| Older releases                      | No                                           |
| `edge` and `sha-<commit>` from main | Fixed by the next commit; not for production |

## Reporting a vulnerability

Please do not open a public issue for a vulnerability, and do not describe it in a pull request.

Report it privately with GitHub's form: <https://github.com/Mistral-valaise/open-skribbl/security/advisories/new> (in the repository: **Security → Report a vulnerability**). Only the maintainers can read the report.

Helpful in a report:

- the version or image digest you looked at, and how the instance was configured;
- what an attacker can do, and what they need for it (a player in the room, network access, a crafted message);
- the steps or the messages that show it.

Kritzel is maintained by volunteers. You can expect a first answer within a week. If the report is confirmed, a fix is prepared in a private advisory, released, and the advisory is published with credit to you unless you prefer otherwise.

## What counts

Kritzel keeps no accounts and stores nothing beyond the life of a room, so the interesting questions are: can a participant read what `viewFor` hides from them (the word, session tokens), act as another participant or as the host, crash or stall the server for others, or get a browser to run script or contact another host.

Not vulnerabilities of this project: a missing TLS setup or rate limit in front of your own instance (see [the hosting guide](docs/HOSTING.md)), and findings that need a compromised browser or operating system.

## How releases are protected

Every released image was tested, scanned for known vulnerabilities and signed as exactly the digest that is published; the hosting guide shows how to [verify the signature](docs/HOSTING.md#verifying-the-signature). Dependencies, the code and the released image are checked again every week ([spec 017](docs/specs/017-release-and-supply-chain.md)).
