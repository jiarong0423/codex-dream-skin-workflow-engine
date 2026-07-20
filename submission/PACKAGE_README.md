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

## Media

- Public demo: https://youtu.be/5viFZCJ57TQ
- `media/gallery/`: five 3:2 submission images and a contact sheet.
- The local MP4 is intentionally omitted because the public YouTube copy is the
  canonical demo. Subtitle, timeline, and storyboard sources remain included.

## Asset Scope

The bundle keeps original generated source art, chroma and cutout intermediates,
and display-sized runtime variants so provenance and the asset pipeline remain
auditable. `runtime-modules.json` classifies source-only assets separately; they
are never loaded into the active runtime payload unless a theme explicitly
selects a runtime variant.

## Privacy Boundary

The package is assembled from an explicit allowlist. It excludes raw local
development history, screenshots and recordings used as defect evidence,
personal workspace paths, private task content, repository history, and
third-party search references. `PACKAGE_CONTENTS.sha256` records every packaged
file.
