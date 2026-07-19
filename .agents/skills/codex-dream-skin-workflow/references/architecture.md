# Unified Architecture Contract

## Product Boundary

Codex Dream Skin is a local, reversible workflow engine for Codex desktop personalization. It must not patch or redistribute the official application. It owns theme specification, runtime assets, local CDP application, verification, restore, and evidence packaging.

## Layer Model

1. `Experience`: user brief, visual language, comfort goal, safe areas, and interaction behavior.
2. `Theme Spec`: `theme.json` values for palette, module surfaces, assets, placement, opacity, and modes.
3. `Runtime Manifest`: `runtime-modules.json` activation, payload keys, load policies, event policies, and budgets.
4. `Asset Pipeline`: high-resolution source art, cutout or chroma processing, display-sized PNG/WebP/SVG runtime variants, and content hashes.
5. `Style Runtime`: `theme.css` owns stable visual surfaces through native selectors and scoped theme classes.
6. `Behavior Runtime`: `renderer-inject.js` owns idempotent DOM markers, retreat, interaction state, cleanup, and restore.
7. `Injection Bridge`: `injector.mjs` owns CDP discovery, per-group transfer, persistent cache, one-shot application, verification, and screenshots.
8. `Lifecycle`: install, launcher policy, current session, hash synchronization, and restore.
9. `Evidence`: tests, module matrix, live verification, screenshot, project log, demo, and submission manifest.

## Module Ownership

- `background`: active-theme-only visual asset; never a content overlay.
- `iconBadge`: display-sized decorative asset; no repeated character placement.
- `character`: independent foreground asset with text and panel retreat.
- `tableFlipCat`: idle trigger shell plus click-time playback asset and deterministic cleanup.
- `buttonGlyphs`: enabled-module-only map with exact semantic matching.
- `projectPanels`: panel-scoped chrome and rows; never a global right-column mask.
- `composerSurface`: native-size glass surface; no frame-sized pseudo-layer.
- `conversationSurface`: message-scoped surfaces; never style processing or status content as a user bubble.
- `staticAccess`: cached stable DOM entrypoints with bounded invalidation.
- `collisionScheduler`: shared geometry scheduling; never duplicate full-page observers.

## State And Data Flow

```text
User brief
  -> normalized theme spec
  -> enabled module plan
  -> source/runtime asset selection
  -> static tests and byte budgets
  -> per-group content hashes
  -> unchanged-group reuse or changed-group transfer
  -> one-shot renderer apply
  -> visual and interaction verification
  -> accept/install or scoped restore
  -> evidence and submission package
```

## Payload Groups

- `core`: theme data, CSS, renderer code, revision, and asset loaders.
- `visual`: background, badge, and character.
- `animationShell`: manual trigger icon.
- `animationPlayback`: sprite and fallback, read only after click and not retained in window memory.
- `buttons`: enabled icon map.

Do not merge these groups. Hash and reuse each group independently.

## Change Discipline

1. Identify the owning layer.
2. Change the smallest module that owns the defect.
3. Add or update a regression assertion.
4. Run static gates.
5. Apply once to the current renderer.
6. Verify actual computed state and geometry.
7. Install only after live evidence passes.
