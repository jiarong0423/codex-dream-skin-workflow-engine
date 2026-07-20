# Credits And Asset Provenance

This file records public-release provenance for the Codex Dream Skin Workflow
Engine. The canonical machine-readable inventory is
`submission/asset-inventory.json`.

## Code

- Runtime, injector, validation scripts, launcher, and documentation were built
  during the Codex Dream Skin development workflow.
- License: MIT, as defined in `LICENSE`.

## Related Work

- [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)
  - Role: public feasibility and product-outcome reference reviewed before this
    implementation.
  - Boundary: no code or visual asset from that repository is copied, vendored,
    redistributed, or required by this project.
  - Independent work in this repository includes the local CDP bridge,
    native-surface discovery, geometry checks, collision retreat, event policy,
    click-time animation lifecycle, payload caching, verification, and restore.

## Approved Visual Assets

- `macos/assets/backgrounds/cyberpunk-contrast-city.png`
  - Role: source background for the final cyberpunk cockpit theme.
  - Provenance: project-generated visual asset selected for the public theme.
- `macos/assets/backgrounds/cyberpunk-contrast-city-runtime.webp`
  - Role: optimized runtime background derived from the approved source PNG.
  - Provenance: local runtime export used for payload reduction.
- `macos/assets/backgrounds/cyber-ruins-pale.png`
  - Role: alternate light ruins background for comparison or documentation.
  - Provenance: project-generated supporting visual asset.
- `macos/assets/icons/cyber-mecha-cat-male-helmet-900.png`
  - Role: selected foreground hero character.
  - Provenance: original Image2-generated cyber-mecha cat character selected
    from generated variants during the design workflow.
- `macos/assets/icons/cyber-mecha-cat-male-helmet-chroma.png`
  - Role: source/chroma variant for the selected hero family.
  - Provenance: original Image2-generated project asset.
- `macos/assets/icons/cyber-mecha-cat-male-helmet-cutout.png`
  - Role: cutout variant for the selected hero family.
  - Provenance: local transparent-background processing from the generated
    source.
- `macos/assets/icons/cyber-robot-orange-cat-512.png`
  - Role: alternate runtime character variant.
  - Provenance: original Image2-generated project asset.
- `macos/assets/icons/cyber-robot-orange-cat-768.png`
  - Role: alternate runtime character variant.
  - Provenance: original Image2-generated project asset.
- `macos/assets/icons/buttons/*.svg`
  - Role: semantic cat and pet themed control glyphs.
  - Provenance: original abstract vector glyphs created for this project.
- `macos/assets/icons/orange-hacker-cat-128.png`
  - Role: small sidebar mascot badge.
  - Provenance: generated from the user-provided orange hacker cat project
    reference and processed locally into transparent runtime badge sizes.
  - Usage boundary: sidebar badge only; do not use it as a full-page wallpaper
    or repeat it across every button.
- `macos/assets/icons/table-flip-cat-left-sprite.webp`
  - Role: manual table-flip interaction playback.
  - Provenance: project-specific 2D orange-cat table-flip animation asset
    produced and locally regenerated during the Dream Skin workflow.
    Transparent GIF, WebP, poster, and sprite variants were generated for
    runtime testing.
  - Usage boundary: describe it with generic table-flip language only; do not
    reference external meme names or third-party artwork in public copy.

## Excluded From Public Package

- Legacy code-rain orange-cat background experiment.
  - Reason: reference-only local history with third-party branded wording in
    the original prompt. It is excluded from the public package and repository.
- Desktop screenshots, image-search references, third-party keyboard
  references, mecha product references, and local defect recordings.
  - Reason: reference-only or private development evidence.
