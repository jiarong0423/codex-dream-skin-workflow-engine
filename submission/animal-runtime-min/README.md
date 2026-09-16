# Dream Skin Forge Animal Runtime

Clean macOS handoff package for Codex desktop animal theme hot swapping.

This package is designed for asset replacement. The runtime frame, CDP injection path, restore path, and safety rules stay fixed; the receiver swaps only files and `pack.json` values under `theme-packs/<pack-id>/runtime`.

## Quick Start

From the extracted package root:

```bash
bash scripts/package-smoke.sh
bash macos/scripts/install.sh
node theme-packs/scripts/activate-pack.mjs list --format text
node theme-packs/scripts/activate-pack.mjs activate --pack orange-mecha-cat --format text
bash macos/scripts/start.sh --once --port 9341
bash macos/scripts/verify.sh --port 9341
```

From the source checkout, this smoke entry builds the clean package first and
then runs the staged package check:

```bash
bash submission/animal-runtime-min/scripts/package-smoke.sh
```

To apply into an already running Codex window that was opened with CDP on port `9341`:

```bash
bash macos/scripts/start.sh --no-launch --once --port 9341 --wait-ms 8000
```

To remove the injected theme from that renderer:

```bash
bash macos/scripts/restore.sh --port 9341
```

## Replace A Pack

Copy one existing pack directory, rename the folder and `id`, then replace only the runtime assets referenced by `pack.json`.

```bash
cp -R theme-packs/orange-mecha-cat theme-packs/my-animal-pack
```

Edit:

- `theme-packs/my-animal-pack/pack.json`
- `theme-packs/my-animal-pack/runtime/backgrounds/*.webp`
- `theme-packs/my-animal-pack/runtime/characters/*.png`
- `theme-packs/my-animal-pack/runtime/animations/*-poster.png`
- `theme-packs/my-animal-pack/runtime/animations/*-sprite.webp`
- `theme-packs/my-animal-pack/runtime/animations/frames/*.png`
- `theme-packs/my-animal-pack/runtime/icons/*.svg`

Keep `schemaVersion: 1`, `status: "asset-ready-unmounted"`, `interaction.activation: "manual-click-only"`, `interaction.preload: false`, and `interaction.idlePlaybackDom: false`.

Run:

```bash
bash scripts/package-smoke.sh
node theme-packs/scripts/activate-pack.mjs plan --pack my-animal-pack --format text
node theme-packs/scripts/activate-pack.mjs activate --pack my-animal-pack --format text
bash macos/scripts/start.sh --once --port 9341
```

## Package Boundary

Included:

- Public Dream Skin Forge macOS runtime.
- Three example animal theme packs.
- Theme-pack activation CLI.
- Launcher files.
- Package smoke check.
- License, notice, credits, and checksum manifest.

Excluded:

- Source-generation prompts.
- Debug screenshots and recordings.
- Private packs.
- Local quarantine folders.
- Git metadata.
- User-specific absolute paths.

See `docs/ASSET_REPLACEMENT_GUIDE.md` for the exact asset contract.
