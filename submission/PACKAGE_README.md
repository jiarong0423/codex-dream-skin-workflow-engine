# Public Submission Package

This bundle contains the public, judge-facing release of Codex Dream Skin
Workflow Engine. It is a source and review bundle, not a signed `.dmg` or `.pkg`
installer. Judges can unzip it and follow the setup and test path below.

## Start Here

1. Read `README.en.md` for the product, architecture, installation, and judge
   test path.
2. Read `submission/devpost-project-description.md` for the concise Build Week
   story.
3. Read `CREDITS.md` and `NOTICE.md` for related work, asset provenance, and
   project boundaries.
4. Run the runtime gate before applying the theme:

```bash
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime
```

## Three Public Hot-Swap Packs

The package contains the exact ordered set declared by
`theme-packs/public-pack-set.json`:

1. `knife-shield-dog` — Knife Shield Dog: Castle City Guard
2. `orbital-stargazer-black-cat` — Black Cat: Orbital Stargazer
3. `orange-mecha-cat` — Orange Mecha Cat: Cyber Ruins

Each packaged theme includes its manifest and runtime directory. The package
builder rejects a missing pack, an unexpected pack manifest, or any missing
asset/icon reference. Inspect and select a pack with the bundled CLI:

```bash
node theme-packs/scripts/activate-pack.mjs list --format text
node theme-packs/scripts/activate-pack.mjs plan --pack knife-shield-dog --format json
node theme-packs/scripts/activate-pack.mjs activate --pack knife-shield-dog --format json
```

`plan` is read-only. `activate` updates only local active-theme state, creates a
backup, and does not launch, restart, or inject Codex. The next one-shot apply
installs the selected pack and exposes the compact three-pack cycle control.

## Media

- Public demo: https://youtu.be/5viFZCJ57TQ
- `media/gallery/`: five 3:2 submission images and a contact sheet.
- The local MP4 is intentionally omitted because the public YouTube copy is the
  canonical demo. Subtitle, timeline, and storyboard sources remain included.

## Asset Scope

The bundle keeps the allowlisted original generated source art, chroma and
cutout intermediates for the primary sample theme, plus display-sized runtime
variants. The three hot-swap packs intentionally ship only `pack.json` and
their runtime directories; their larger working sources and previews remain
outside the judge bundle. `runtime-modules.json` classifies source-only assets
separately so they never enter the active runtime payload.

## Privacy Boundary

The package is assembled from an explicit allowlist. It excludes raw local
development history, screenshots and recordings used as defect evidence,
personal workspace paths, private task content, repository history, and
third-party search references. `PACKAGE_CONTENTS.sha256` records every packaged
file.
