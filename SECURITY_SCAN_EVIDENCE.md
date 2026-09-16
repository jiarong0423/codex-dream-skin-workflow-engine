# Security Scan Evidence

## Runs

| Date | Tool | Scope | Result |
|---|---|---|---|
| 2026-09-16 | `ai-security-rules` (VibeGate) `rules-check` | Whole repository, agent-readable config, repo-borne executable config | 0 critical, 4 high, 789 medium; all high and medium hits are documentation prose and CSS/identifier keyword matches, reviewed below |
| 2026-09-16 | `release-boundary-safety-gate` scanner | 727 local text artifacts | PASS, 0 findings |
| 2026-09-16 | `localguard-dev-safety-gate` scanner | Whole repository | 50 findings inside tracked files, all reviewed as false positives, detailed below |
| 2026-09-16 | gitleaks | Git history and working tree | Clean, see `SECRET_SCAN_EVIDENCE.md` |
| 2026-09-16 | `node --check`, `bash -n`, `macos/tests/run-tests.sh` | All modified JavaScript, shell, and the runtime gate suite | Pass |

## Reviewed Findings

- `LG-AUTH-001` (9 hits): matches `display: none` on theme-owned elements in
  `macos/assets/theme-*.css`. This project has no authentication surface and no
  protected DOM; the rule's client-side auth gate pattern does not apply.
- `LG-SECRET-002` (26 hits): matches identifier text such as
  `/Applications/ChatGPT.app`, `triggerIconPath`, `matchedAllowlist`, and the
  payload schema name `renderer-safe-theme-packs-data-20260723`. No credential
  material is present; gitleaks confirms this independently.
- `LG-AGILE-003` (10 hits): matches the words `temporary`, `debug port`, and
  `test` in README and architecture prose.
- VibeGate high findings (4 hits): two lines in the workflow skill document and
  their copy in the public package describe running
  `macos/tests/run-tests.sh` and installing only when gates pass. They are
  prose, not executable config. The repository ships no `.mcp.json`, no
  `.claude/` hooks, no `.cursor` or `.vscode` task configuration, and no
  `package.json`, so nothing in this repository can auto-run on workspace trust,
  agent startup, or dependency install.

## Accepted Residual Risk

The VibeGate `rules-check` gate reports one blocking P1,
`mcp_or_agent_shell_without_allowlist`, on 2026-09-16. It is raised by the four
high findings listed above, which are prose lines in the workflow skill document
that name `macos/tests/run-tests.sh` and use the word "install". The rule keys on
the presence of those high findings rather than on evidence, and the scanner's
tuning file cannot suppress high findings or gate failures, so the gate cannot be
cleared by documentation.

This is accepted rather than remediated. Rewording the skill document to avoid
the matched keywords would hide the string without changing any behaviour, and
would make the operator instructions less clear. The actual exposure was checked
directly: the repository contains no `.mcp.json`, no `.claude/` hook
configuration, no `.cursor` or `.vscode` task definition, and no `package.json`,
so no command in this repository can auto-run from workspace trust, agent
startup, or dependency install. `MCP_SERVER_ALLOWLIST.md` records the commands an
agent may run here and the approval they require.

The `export-gate` mode, which is the gate that matches publication, passes with
zero blocking findings.

No dedicated SAST engine (semgrep, CodeQL, SonarQube, Bandit, or gosec) has been
run against this repository. The codebase is macOS shell, Node ES modules, and
CSS with no server, no database, no dependency manifest, and no network egress
beyond loopback. Static verification is currently `node --check`, `bash -n`, the
runtime gate suite, and the module boundary gate. Adding semgrep to this table is
the next planned hardening step.
