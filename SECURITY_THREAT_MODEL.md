# Security Threat Model

Scope: the local macOS theme workflow engine in this repository. Last reviewed
2026-09-16.

## Assets

- The user's installed Codex desktop app (`/Applications/ChatGPT.app`), its
  `app.asar`, code signature, and signed-in session. This engine never writes to
  any of them.
- Theme state installed under `~/Library/Application Support/CodexInterfaceTheme`
  and `~/Library/Application Support/DreamSkinForge`, including active theme
  selection, packaged asset groups, and launcher logs.
- Theme pack assets in `theme-packs/`, plus the private packs and drafts that
  stay local and are excluded from this repository.
- The development journal and preview evidence, which stay local because they
  record absolute local paths and screenshots.

## Trust Boundaries

Each trust boundary below names the crossing point and the control that
guards it.

1. Repository source to local runtime. Scripts run with the user's own account.
   There is no installer daemon, no privileged helper, and no `sudo` path.
2. Local runtime to the Codex renderer. The only channel is the Chromium
   DevTools Protocol bound to `127.0.0.1` on the configured port (default 9341).
   The engine refuses to launch or restart Codex when the port is closed in
   read-only audit modes.
3. Repository to public distribution. `submission/build-public-package.sh`
   rebuilds the public bundle and refuses to publish when a local path,
   screenshot filename, mail address, or key-shaped string enters the package.

## Data Flows

- `macos/scripts/injector.mjs` reads `http://127.0.0.1:<port>/json/version` and
  `/json/list`, attaches to the Codex target, and applies CSS plus lightweight
  DOM ownership markers in one shot.
- Audit and scan scripts read the same local CDP endpoint and write evidence
  into `macos/previews/`, which is local-only.
- No script sends data to a remote host. The `https://chatgpt.com` and
  `https://chat.openai.com` strings are target-URL matching only.

## Threats and Controls

| Threat | Control |
|---|---|
| A local process reaches the debug port and drives the renderer | The port binds to `127.0.0.1` only, is opened deliberately by the user, and audit modes refuse to open it themselves |
| Theme injection breaks or hides native Codex controls | `macos/tests/run-tests.sh`, the module matrix, and the black-layer scans assert owner identity, hitbox geometry, and restore readiness before apply |
| A theme pack ships an oversized or untrusted asset | Content-hash asset groups, payload budget gates, and `theme-packs/validate-packs.sh` run before packaging |
| Local paths, screenshots, or private packs leak into the public repo | `.gitignore` keeps the journal, preview evidence, private packs, and drafts local; the package builder scans for the same patterns |
| An agent runs an unexpected command from repo-borne config | See `MCP_SERVER_ALLOWLIST.md`; the repository ships no `.mcp.json`, no `.claude` hooks, and no package install scripts |
| Restore leaves the user without their original interface | `macos/scripts/restore.sh` and the scoped restore path are part of every gate run |

## Residual Risk

The engine requires the user to open a Chromium debug port on loopback while a
theme is applied. Any process already running as that user can reach that port
while it is open. This is accepted for a local personal-customization tool and
is the reason apply is one-shot rather than a resident daemon by default.
