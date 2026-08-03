# Local Asset Check Standard

This standard is the offline gate before any Codex Dream Skin asset can be mounted into a live carrier. It is intentionally local-only.

## Scope

- Read `macos/assets/atomic-control-assets.json`.
- Read every `theme-packs/*/pack.json`.
- Verify referenced local files, dimensions, bytes, media signatures, alpha safety, payload grouping, and local package cleanliness.
- Do not connect to CDP.
- Do not launch Codex.
- Do not inject CSS or renderer JavaScript.
- Do not click, drag, restore, delete, or change permissions.

## Required Checks

1. Side effects must be explicitly false in the atomic asset manifest.
2. Every asset path must be relative and remain inside its asset root.
3. File extension, declared media type, and image signature must agree.
4. Declared byte counts must match actual local file sizes.
5. Runtime backgrounds must be WebP, at least desktop-preview width, and close to 16:9.
6. Foreground characters, badges, mascots, posters, sprites, frames, and SVG icons must preserve transparency.
7. Runtime assets must fit their manifest or mount-contract byte budgets.
8. Pack interaction must remain manual-click-only with no preload and no idle playback DOM.
9. Playback sprites and posters must stay in `animationPlayback`, not in the visual preload group.
10. Local package pollution such as `.DS_Store`, `__pycache__`, or `.pyc` is reported and blocks strict mount readiness.

## Commands

Read-only report:

```bash
node macos/scripts/local-asset-standard.mjs --format text
```

Strict mount gate:

```bash
node macos/scripts/local-asset-standard.mjs --strict true --format text
```

Machine-readable report:

```bash
node macos/scripts/local-asset-standard.mjs --format json
```

## Current Interpretation

- `ok=true` means all local asset standards passed.
- `mountReady=true` means the assets are locally clean enough to become a candidate for a carrier or visual gate.
- `ok=false` with only local metadata findings means the assets themselves can still be inspected, but strict mounting should wait until the metadata files are cleaned by an explicit cleanup action.
- Passing this standard does not mean live UI is safe. Live safety still requires a separate dynamic boundary scan and visual gate.
