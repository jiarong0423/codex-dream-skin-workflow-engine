# Devpost Project Description

## Project Name

Codex Dream Skin Workflow Engine

## One-Line Tagline

A reversible workflow engine that turns Codex-assisted visual briefs into safe,
modular, verified desktop themes for long developer sessions.

## Category

Developer Tools

## Secondary Impact Lens

Work and Productivity

## Problem

Developer tools are usually visually rigid, while unsafe theming approaches can
break layout, obscure native controls, increase runtime load, or require changes
to a signed desktop application. I wanted a way to make Codex feel personal and
energizing without sacrificing readability, safety, reversibility, or
performance.

## Solution

Codex Dream Skin is a local workflow engine for Codex desktop personalization on
macOS. Instead of shipping one static skin, it converts a visual direction into
a structured theme specification, separates modules, optimizes assets, applies
only changed payload groups through local CDP, verifies real UI geometry, and
restores the native interface when needed.

The sample cyber-mecha cat theme demonstrates the workflow: a generated
foreground character, cyberpunk background, glass-style surfaces, semantic pet
tool icons, manual table-flip interaction, collision retreat behavior, and a
low-load runtime policy.

## What It Does

- Applies a Codex desktop theme through local `127.0.0.1` CDP access.
- Keeps background, character, badge, composer, panel, button glyphs, and
  animation as separate modules.
- Uses content hashes so unchanged asset groups do not transfer again.
- Loads the table-flip animation only after the manual trigger is clicked, then
  releases playback memory after the animation completes.
- Detects content and side-panel collisions so decorative characters retreat
  instead of covering the work surface.
- Provides tests, module matrix checks, live verification, screenshots, and a
  restore path.

## How Codex And GPT-5.6 Were Used

Codex and GPT-5.6 were used as the design and engineering loop: converting a
visual brief into structured theme modules, generating and selecting original
Image2 assets, diagnosing screenshots and screen recordings, finding hidden
layer defects, reducing polling and GPU-heavy effects, splitting runtime
modules, writing tests, and maintaining a development log that records direct
causes, root causes, and regression guards.

## Technical Implementation

The project is built around explicit ownership boundaries:

- `theme.json` stores the selected theme, palette, assets, safe areas, and
  module options.
- `runtime-modules.json` stores activation policy, payload groups, budgets, and
  event policy.
- `theme.css` owns stable visual surfaces.
- `renderer-inject.js` owns idempotent runtime markers, collision retreat,
  manual animation lifecycle, cleanup, and restore.
- `injector.mjs` owns CDP discovery, content-hash caching, payload transfer,
  one-shot apply, verification, and screenshots.

The workflow gate checks syntax, runtime budgets, module wiring, launcher
policy, restore compatibility, and animation lifecycle. The final optimized
runtime avoids live backdrop blur, fixed wallpaper attachment, idle theme
animation, and resident playback assets.

## Safety And Reversibility

The project does not patch the official app bundle, does not modify `app.asar`,
does not alter code signatures, and does not read or write authentication data,
API keys, base URLs, or model settings. The theme is applied at runtime through
local CDP and can be removed with the included restore script.

## Impact

The broader value is not only a cyberpunk cat theme. The useful part is the
workflow: developers can turn a mood, reference image, or brand direction into a
structured, testable, reversible Codex theme without risking the real work
surface. That makes long sessions feel more personal while keeping the tool
usable and measurable.

## Demo And Testing

The demo video is under three minutes and uses English narration. Judges can
run the local tests, install the engine, apply the theme once, verify the active
renderer, and restore the original interface without rebuilding or modifying the
official application.

```bash
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime
bash macos/scripts/install.sh
bash macos/scripts/start.sh --no-launch --once --port 9341 --wait-ms 8000
bash macos/scripts/verify.sh --port 9341
bash macos/scripts/restore.sh --port 9341
```
