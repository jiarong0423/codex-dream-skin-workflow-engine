# Secret Scan Evidence

## Run

- Tool: gitleaks (local install), plus the repository's own release pattern scan
  in `submission/build-public-package.sh`.
- Date: 2026-09-16.
- Scope: full git history of this repository (30 commits, ~2.90 MB scanned) and
  the complete working tree (~110.94 MB scanned, including untracked and ignored
  local evidence).
- Commands:

```bash
gitleaks detect --source . --report-format json --redact
gitleaks detect --source . --no-git --report-format json --redact
```

## Result

Both runs reported **no leaks found**, exit status 0. The history scan and the
working tree scan are clean.

A separate pattern scan for local absolute paths, screenshot filenames, mail
addresses, and key-shaped strings was run over every file staged for this
release. Findings were remediated before commit:

- The development journal was removed from version control and is now local-only.
- Preview SUMMARY markdown and `.err` captures are local-only.
- Evidence references in `docs/SURFACE_GAP_MATRIX.json` use repository-relative
  paths and `local-evidence:` identifiers.
- The chainsaw launcher and its app binary resolve their fallback project root
  from `$HOME` instead of a hardcoded user directory.

Post-remediation the same pattern scan reports zero hits across all tracked
files.

## Accepted Residual Risk

Commits published before 2026-07-20 contain absolute local paths inside the
development journal that was tracked at that time. The path prefix reveals only
the macOS account name, which matches the public repository owner, and no
credential material. History is not rewritten; the journal is untracked going
forward.
