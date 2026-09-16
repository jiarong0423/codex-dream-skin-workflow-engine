# Package Runner and Command Allowlist

This repository does not grant automatic command execution. An operator must approve the current task before any command that changes live UI state, writes active-theme state, starts a daemon, builds a public archive, commits, pushes, publishes, or writes outside an isolated temporary directory. Only a direct command or builder-internal command listed below is allowed.

## Allowed read-only and isolated validation commands

Run these only from the repository root with the checked-in arguments shown here:

```text
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --submission
bash macos/tests/run-tests.sh
node macos/scripts/module-matrix.mjs --state-dir <isolated-state-directory> --assets-dir macos/assets --json
bash theme-packs/validate-packs.sh
bash theme-packs/validate-packs.sh --runtime-only
node theme-packs/scripts/activate-pack.mjs list --format text
node theme-packs/scripts/activate-pack.mjs plan --pack knife-shield-dog --format json
node theme-packs/scripts/activate-pack.mjs plan --pack orbital-stargazer-black-cat --format json
node theme-packs/scripts/activate-pack.mjs plan --pack orange-mecha-cat --format json
```

`<isolated-state-directory>` must be a task-owned temporary directory or an existing read-only state directory selected by the operator. Validation must not overwrite canonical runtime state.

## Approval-required commands

The following exact entrypoints are allowed only after explicit operator approval for the current task:

```text
bash macos/scripts/start.sh --no-launch --once --visual --port 9341 --wait-ms 8000
bash macos/scripts/start.sh --no-launch --once --port 9341 --wait-ms 8000
bash macos/scripts/verify.sh --port 9341
bash macos/scripts/restore.sh --port 9341
bash macos/scripts/restore.sh --quit
bash macos/scripts/install.sh
node theme-packs/scripts/activate-pack.mjs activate --pack knife-shield-dog --format json
node theme-packs/scripts/activate-pack.mjs activate --pack orbital-stargazer-black-cat --format json
node theme-packs/scripts/activate-pack.mjs activate --pack orange-mecha-cat --format json
bash submission/build-public-package.sh
git commit <reviewed-paths>
git push origin main
```

The public-package builder may invoke these scoped internal commands only with paths that it created beneath its staged package or isolated temporary HOME:

```text
bash theme-packs/validate-packs.sh --runtime-only
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --submission --project-root <builder-created-staged-package-root>
find <builder-created-staged-package-root> -type f
shasum -a 256 <staged-file>
zip -X -q -r <repository-export-zip> <staged-package-name>
```

The installed-engine restore forms documented in the README are aliases of the reviewed repository restore entrypoint and retain the same approval requirement:

```text
~/.codex/dream-skin-forge/scripts/restore.sh --port 9341
~/.codex/dream-skin-forge/scripts/restore.sh --quit
```

No wildcard command expansion outside the builder's fixed staged root, arbitrary package runner, dependency download, lifecycle hook, unreviewed network access, force push, or command assembled from untrusted input is allowed. If a command or bounded placeholder form is absent from this allowlist, stop and request operator review before adding it.
