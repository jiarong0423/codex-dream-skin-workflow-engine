# Asset Replacement Guide

The hot-swap package has three ownership layers. Replace only the asset layer unless you are deliberately changing runtime behavior.

## 1. Pack Manifest

Each pack lives at:

```text
theme-packs/<pack-id>/pack.json
```

Required fields:

```json
{
  "schemaVersion": 1,
  "id": "my-animal-pack",
  "displayName": "My Animal Pack",
  "status": "asset-ready-unmounted",
  "palette": {
    "accent": "#19e6a3",
    "secondary": "#00c8f8",
    "warm": "#f2a23a",
    "alert": "#ff5a45",
    "surface": "rgba(9, 13, 16, 0.72)",
    "surfaceStrong": "rgba(8, 10, 13, 0.86)",
    "text": "#f4f7fb"
  },
  "assets": {
    "background": "runtime/backgrounds/background.webp",
    "heroCharacter": "runtime/characters/hero.png",
    "interactionMascot": "runtime/characters/mascot.png",
    "interactionPoster": "runtime/animations/action-poster.png",
    "interactionSprite": "runtime/animations/action-sprite.webp",
    "interactionTrigger": "runtime/icons/trigger.svg"
  },
  "interaction": {
    "id": "my-action",
    "activation": "manual-click-only",
    "placement": "right-bottom",
    "frameCount": 8,
    "durationMs": 1400,
    "preload": false,
    "idlePlaybackDom": false,
    "cleanup": "remove playback node and decoded sprite immediately after completion"
  }
}
```

Rules:

- `id` must match the directory name.
- Asset paths must be relative to the pack directory.
- Do not use absolute paths.
- Do not use `..` path segments.
- Keep animation playback manual-click-only.
- Keep playback assets out of idle preload.

## 2. Runtime Asset Slots

Replaceable slots:

| Slot | Path | Format | Purpose |
| --- | --- | --- | --- |
| Background | `runtime/backgrounds/*.webp` | WebP | Body scene background below native content |
| Hero character | `runtime/characters/*.png` | Transparent PNG | Large left-side animal/character decoration |
| Mascot | `runtime/characters/*.png` | Transparent PNG | Small interaction identity |
| Interaction poster | `runtime/animations/*-poster.png` | Transparent PNG | Resting first frame for the click animation |
| Interaction sprite | `runtime/animations/*-sprite.webp` | WebP with alpha | Horizontal animation strip |
| Animation frames | `runtime/animations/frames/*.png` | Transparent PNG | Reviewable extracted frame sources |
| Trigger icon | `runtime/icons/trigger.svg` | SVG | Manual click trigger |
| Button icons | `runtime/icons/*.svg` | SVG | Optional UI icon replacements |

Recommended budgets:

- Background: keep under the `mountContracts.background.budgetBytes` value.
- Hero character: keep under `mountContracts.heroCharacter.budgetBytes`.
- Interaction sprite: keep under `mountContracts.interaction.budgetBytes`.
- SVG icon: keep simple, single-purpose, and valid XML.

## 3. Animation Strip Contract

The interaction sprite is a horizontal strip.

Examples:

- `knife-shield-dog`: `1536x192`, 6 frames, each frame `256x192`.
- `orbital-stargazer-black-cat`: `2048x192`, 8 frames, each frame `256x192`.
- `orange-mecha-cat`: `2880x250`, 8 frames, each frame `360x250`.

If you change `frameCount`, update:

- `interaction.frameCount`
- `interaction.durationMs`
- the number of PNG files in `runtime/animations/frames`
- the sprite strip dimensions

The runtime does not require every pack to use the same frame cell size, but the frames must be evenly distributed across the horizontal strip.

## 4. Do Not Edit These For Simple Skin Swaps

Do not modify these unless you are changing runtime behavior:

- `macos/assets/renderer-inject.js`
- `macos/assets/theme.css`
- `macos/assets/theme.json`
- `macos/assets/runtime-modules.json`
- `macos/scripts/injector.mjs`
- `macos/scripts/theme-store.mjs`
- `macos/scripts/start.sh`
- `macos/scripts/restore.sh`

Direct cause when swaps break: usually a bad path, bad JSON, missing alpha, or frame-count mismatch.

Root cause when swaps repeatedly break: asset replacement is being mixed with runtime editing. Keep pack assets isolated under `theme-packs/<pack-id>/runtime`.

## 5. Validation

Before sharing a modified package:

```bash
bash scripts/package-smoke.sh
node theme-packs/scripts/activate-pack.mjs plan --pack <pack-id> --format text
node theme-packs/scripts/activate-pack.mjs activate --pack <pack-id> --format text
bash macos/scripts/start.sh --once --port 9341
bash macos/scripts/verify.sh --port 9341
```

If `package-smoke.sh` fails, fix the package before applying it live.
