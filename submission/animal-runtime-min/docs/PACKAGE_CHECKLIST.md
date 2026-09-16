# Package Checklist

Use this before sending the package to another person.

## Must Pass

- `bash scripts/package-smoke.sh`
- `shasum -a 256 -c PACKAGE_CONTENTS.sha256`
- `node theme-packs/scripts/activate-pack.mjs list --format text`
- `node theme-packs/scripts/activate-pack.mjs plan --pack orange-mecha-cat --format text`

When running from the source checkout instead of an extracted package, use:

- `bash submission/animal-runtime-min/scripts/package-smoke.sh`

That source entry builds the clean package first and then runs the same smoke
check inside the staged package root.

## Required Boundary

- No `.git` directory.
- No `.DS_Store` or `._*` Finder metadata.
- No `theme-packs/private-packs`.
- No chainsaw/anime private pack files.
- No local home-directory absolute paths.
- No source-generation prompts or debug screenshots.
- No local quarantine directory.

## Share These Files

- `dream-skin-forge-animal-runtime-min.tar.gz`
- `dream-skin-forge-animal-runtime-min.tar.gz.sha256`

The `.sha256` file verifies the archive. `PACKAGE_CONTENTS.sha256` verifies files after extraction.
