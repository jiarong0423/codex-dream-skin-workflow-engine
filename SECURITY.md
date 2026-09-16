# Security

## Reporting

Report a suspected issue through a GitHub issue on this repository. Do not
include local paths, screenshots of private content, or credential values.

## Secrets

This project uses no API keys, tokens, passwords, or service credentials. It
talks only to a local Chromium DevTools Protocol port on `127.0.0.1` and writes
theme state under the user's own Application Support directory. No secret value
is stored in this repository, in theme packs, or in the published package.

If a secret is ever introduced, it must be recorded here by name only, never by
value, with these four fields:

| Field | Requirement |
|---|---|
| Owner | The repository owner is accountable for every secret listed here |
| Storage | macOS Keychain or a local environment file that is never committed |
| Rotation | Rotate on any suspected exposure and at least every 90 days |
| Revoke | Revoke at the issuing provider first, then remove the local copy and record the date here |

Current secret inventory: none.

## Configuration That Is Not Secret

`CIT_DEFAULT_PORT`, `CIT_PRIVATE_DUEL_PORT`, `CIT_PRIVATE_DUEL_WAIT_MS`,
`CIT_PRIVATE_DUEL_GATE`, and `DREAM_SKIN_PROJECT_ROOT` select local ports,
timeouts, and paths. They carry no credential material.

## Scan Evidence

- `SECRET_SCAN_EVIDENCE.md` records git history and working tree secret scans.
- `SECURITY_SCAN_EVIDENCE.md` records code-security scan scope and results.
- `SECURITY_THREAT_MODEL.md` records assets, trust boundaries, data flows,
  threats, and controls.
