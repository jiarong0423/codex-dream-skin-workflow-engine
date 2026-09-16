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

On 2026-09-16 a batch of previously unpushed local commits was pushed to this
public repository. The public tip before that push contained no absolute local
path anywhere in its tree. The pushed commits carried a tracked development
journal holding 81 occurrences of an absolute local path, plus screenshot and
screen-recording filenames, which the tip of that push no longer contained. The
working tree and the pushed tip were scanned; the commit range being pushed was
not. That gap is the direct cause.

Remediation, same day: the journal was removed from every commit with
`git filter-repo`, the remaining absolute paths were replaced with
`/Users/<local-user>` and `Desktop/<local-screenshots>`, and both branches were
force-pushed. A fresh mirror clone taken from the remote afterwards reports zero
matches for the local account name, the screenshot directory, the owner's mail
address, and the account handle, and confirms the journal is absent from all 30
commits. GitHub Support was asked to purge cached views of the removed objects.
No credential was involved at any point; gitleaks reported no leaks before and
after.

Residual: one screen-recording filename, dated 2026-07-31, remains in older
revisions of `docs/SURFACE_GAP_MATRIX.json`. It is a bare filename with no path,
account name, or identifier, and the current revision no longer contains it.
Accepted rather than rewritten again. The filename is not reproduced here: a
record of a residue must not reintroduce it at the tip.

Standing control: before any push, scan the commit range rather than the tip.
None of gitleaks, the release boundary scanner, the dev safety scanner, or
semgrep covers this, because the first looks for credentials only and the rest
read the working tree rather than history.
