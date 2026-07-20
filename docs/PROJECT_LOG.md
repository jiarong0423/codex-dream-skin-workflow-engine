# Codex Dream Skin Public Development Log

This is the public, sanitized development log for Codex Dream Skin Workflow
Engine. It summarizes the build process, architecture decisions, debugging
failures, and release gates without exposing local filesystem paths, private
tasks, screen-recording evidence, or personal workspace content.

The private raw troubleshooting log is kept locally and is intentionally not
part of the public package.

## Project Scope

- Product: Codex Dream Skin Workflow Engine.
- Event: OpenAI Build Week 2026.
- Primary category: Developer Tools.
- Impact lens: Work and Productivity.
- Supported platform for this submission: macOS.
- Runtime boundary: local Chromium DevTools Protocol on `127.0.0.1`.
- Safety boundary: no official app bundle edits, no `app.asar` patching, no
  code-signature changes, and no authentication or model-setting changes.

## Public Development Timeline

### 2026-07-17: Safe Runtime Boundary

The project started as a local Codex desktop interface theme. The first
architecture decision was to keep the official desktop application untouched
and apply visual changes only through a reversible local runtime layer.

Direct cause addressed:

- Static visual experiments could make the interface personal but offered no
  safe restore path.

Root cause addressed:

- Personalization work was being treated as a visual skin instead of a
  lifecycle-managed developer tool.

### 2026-07-17 to 2026-07-18: Visual Brief To Theme Language

The design brief combined an orange-cat identity, green code-rain hacker mood,
cyberpunk contrast lighting, mechanical controls, and a cyber-mecha foreground
character. Codex and GPT-5.6 were used to decompose that brief into safe areas,
module order, color roles, and verification checkpoints.

Public-safe design decisions:

- Cyan and teal define navigation and workspace structure.
- Gold and orange define mechanical focus accents.
- Magenta and red define contrast zones and transient energy.
- Large character art is decorative and must retreat when work content needs
  the space.

### 2026-07-18: Original Asset Pipeline

Image2 was used to generate original project assets, then local processing
created runtime variants. The final public set separates source art from
display-sized runtime assets.

Approved asset families:

- Cyberpunk contrast-city background and optimized WebP runtime background.
- Alternate pale cyber-ruins background for comparison views.
- Original cyber-mecha cat foreground character family.
- Orange hacker-cat badge derived from the user's project reference.
- Abstract pet-themed SVG control glyphs.
- Manual table-flip interaction sprite and fallback assets.

Excluded asset classes:

- Third-party search screenshots and product references.
- Internal defect screenshots and screen recordings.
- Legacy prompt experiments that used third-party branded wording.
- Local paths, personal workspace labels, and private task content.

### 2026-07-18 to 2026-07-19: Layer Debugging

Screenshots and recordings exposed several UI-layer failures. The debugging
work split geometry defects from color defects before changing opacity.

Major defects and resolutions:

- Full-workspace masks were removed because they covered native content.
- Right-panel chrome was scoped to the panel itself instead of the whole
  right column.
- Composer black-frame contamination was traced to extra native shell layers
  and fixed by matching native geometry instead of painting a larger frame.
- Workspace picker bleed was fixed with a deep but localized plate, not a
  full-screen mask.
- Flicker was reduced by moving stable surfaces to CSS ownership and avoiding
  repeated runtime reinstallation.

### 2026-07-19: Interaction And Retreat

The large cyber-mecha cat became an independent foreground module with retreat
logic. It yields to text, side panels, and major workspace content instead of
covering the user interface.

The table-flip interaction was changed from resident animation to manual
click-time playback:

- Idle state keeps only a small trigger.
- Playback asset loads only after click.
- The animation plays once.
- Playback DOM and decoded asset state are released after completion.

### 2026-07-19: Performance Reduction

The runtime was reduced through a subtractive pass.

Changes:

- Large raster backgrounds use display-sized WebP variants for runtime.
- Asset groups are content-hashed so unchanged groups are not transferred.
- Heavy live blur and fixed wallpaper attachment were removed.
- Idle animation was removed.
- No resident injector daemon is required for the final flow.
- Light maintenance and heavy maintenance remain low-frequency and are not
  used to repaint stable surfaces.

Measured expectation:

- The optimized design should be substantially lighter than early prototypes,
  but public claims stay conservative because CPU and GPU numbers depend on
  the active Codex workload and macOS compositor state.

### 2026-07-20: Submission Package

The public repository was prepared around one product narrative:

- Reversible local workflow engine.
- Structured theme specification.
- Runtime module manifest.
- CDP one-shot apply.
- Geometry and interaction verification.
- Restore path.
- Public asset provenance.
- Devpost-ready description, video link, and judge test path.

## Architecture Summary

```text
Visual brief
  -> theme.json
  -> asset processing
  -> runtime-modules.json
  -> tests and budgets
  -> local CDP one-shot apply
  -> visual and interaction verification
  -> install or restore
  -> public evidence package
```

## Current Public Gate

The final public workflow is expected to pass:

```bash
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --submission
```

## Packaging Boundary

Included:

- Source code and scripts required to install, apply, verify, and restore.
- Public README files and Devpost description.
- Public workflow skill and gate scripts.
- Public-safe source and runtime visual assets.
- Subtitle/timeline/storyboard files that explain the demo.

Excluded:

- Local raw troubleshooting history.
- Desktop screenshots and screen recordings used only as defect evidence.
- Local audio/video build artifacts when a public YouTube URL is available.
- Personal account names, private tasks, and local workspace paths.
- Third-party search-result reference imagery.

### 2026-07-20: Public History Sanitation

Before final submission, the public branch was rebuilt from the sanitized
release tree as a single root commit. This removed superseded development-log
content from the branch history while preserving the same reviewed source,
assets, setup instructions, verification gates, and restore path.

The public release contains no local raw troubleshooting log, private media,
personal workspace paths, or credentials.

### 2026-07-20: Native Mount Architecture And Public Bundle Refresh

The judge-facing explanation was updated to distinguish the workflow engine
from a static wallpaper or copied skin. The public result of
Fei-Away/Codex-Dream-Skin is disclosed as a feasibility reference; no code or
visual asset from that project is copied, vendored, or required here.

The architecture now documents five native mount policies:

- Body-only scene painting without a full-workspace content overlay.
- In-place styling of verified native Codex surfaces.
- Independent pointer-safe decoration with collision retreat.
- Event-triggered discovery and cleanup of transient portal shells.
- Click-time interaction playback with deterministic release.

Direct cause addressed:

- Earlier public copy described modules and effects but did not clearly explain
  that native layer discovery and mount decisions are part of the product.

Root cause addressed:

- The visual sample could be mistaken for the product itself even though the
  implementation contains geometry, collision, scheduling, caching, lifecycle,
  verification, and restore algorithms.

A manifest-driven package builder was added. It copies only allowlisted public
files, optionally adds the final gallery and captioned demo, removes metadata
artifacts, rejects known private-path and credential patterns, writes a SHA-256
inventory, and enforces the Devpost 35 MB upload limit.

The first read-only archive audit found that the final manifest entry,
`macos/tests`, was missing. The manifest reader emitted no trailing newline and
the shell loop did not consume the final record. The loop now accepts a final
unterminated record; the rebuilt archive must contain `macos/tests/run-tests.sh`
before it can pass package review.

The first judge-path simulation then found that the skill-local
`competition-manifest.json` was not in the allowlist even though the root
manifest was present. The workflow gate requires both paths. The skill-local
manifest and `agents/openai.yaml` are now explicit public-package entries, and
the final gate is executed from a freshly extracted archive rather than only
from the source workspace.

The extracted runtime tests also require the launcher fixtures for shell and
property-list validation. `macos/launcher` is now an explicit package entry;
Finder metadata inside that directory is removed by the packaging cleanup pass.

The selector and asset-reference regression checks also consume the HTML files
under `macos/previews`. That directory is now packaged as a test fixture rather
than being treated as optional presentation output.

Final evidence: a freshly extracted public archive passed its internal SHA-256
inventory, runtime tests, module matrix, and strict submission gate without
reading files from the source workspace.

### 2026-07-20: Release Bundle Load And Size Convergence

The public release remains a source and judge-review ZIP rather than a signed
macOS installer. The launcher, setup scripts, runtime tests, restore path,
generated source art, and display-sized runtime variants remain included.

Direct causes addressed:

- The static DOM cache published hit, miss, generation, and reason counters to
  `documentElement.dataset` on every cache access even though no runtime or test
  consumed those values.
- The package duplicated the public YouTube demo as a local MP4, leaving little
  room under the 35 MB Devpost upload limit.
- Ten intentional generated source, chroma, cutout, and alternate animation
  assets were reported as unclassified archive candidates.

Root causes addressed:

- Diagnostic telemetry was coupled to the hot cache path instead of remaining
  outside production behavior.
- Submission media and auditable source assets had not been separated from
  runtime payload ownership in the package policy.

Changes:

- Removed unused static-cache dataset telemetry while preserving cache lookup,
  invalidation, route, mutation, resize, and right-trigger behavior.
- Added `retainedSourceAssets` to `runtime-modules.json`; the module matrix now
  verifies these files exist but excludes them from runtime payload and archive
  warnings.
- Kept original generated source art and runtime variants in the public bundle,
  but omitted the redundant local MP4 because the public YouTube URL is the
  canonical demo.
- Updated the judge package README to state that the ZIP is not an Apple-signed
  installer.

Validation evidence:

- Renderer size reduced from 105,959 to 104,961 bytes under the 106,000-byte
  budget.
- Module matrix passed all scenarios with 10 classified retained source assets,
  zero unclassified archive candidates, and a 604,901-byte active payload under
  the 9,000,000-byte budget.
- Source and freshly extracted package both passed runtime tests, internal
  SHA-256 verification, runtime gate, and strict submission gate in an isolated
  `HOME`.
- Source and package both failed closed for a missing table-flip sprite, an
  asset path escape, and a one-byte runtime payload budget.
- Privacy scans found no packaged personal paths or credential patterns; 14
  Markdown files contained 13 valid local links and zero broken links.
