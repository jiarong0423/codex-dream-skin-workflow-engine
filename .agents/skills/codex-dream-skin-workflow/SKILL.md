---
name: codex-dream-skin-workflow
description: Design, implement, debug, validate, package, or submit Codex Dream Skin themes through one safe workflow. Use for Codex desktop skin, theme, background, glass UI, icon, character, animation, collision retreat, CDP injection, performance reduction, rollback, Build Week submission, demo, README, or release-gate work in the Codex Dream Skin project.
---

# Codex Dream Skin Workflow

Treat Codex Dream Skin as one product: a schema-driven workflow engine for safely designing, applying, testing, and reverting personalized Codex desktop themes. Do not split the developer-tool implementation from the productivity story.

## Positioning

- Submit to `Developer Tools` as the primary track.
- Present `Work & Productivity` as the measured user-value layer.
- Describe one product, one repository, one demo, and one workflow.
- Emphasize safe customization, reversible runtime integration, visual ergonomics, and Codex-assisted development.

Read [competition.md](references/competition.md) when planning the pitch, submission, README, or demo. Read [architecture.md](references/architecture.md) before changing module boundaries. Read [guardrails.md](references/guardrails.md) before live UI, selector, animation, launcher, or performance work.

## Canonical State

1. Read `docs/PROJECT_LOG.md` from the latest section backward.
2. Read `macos/assets/theme.json` and `macos/assets/runtime-modules.json`.
3. Read `competition-manifest.json` for Build Week status.
4. Inspect current files and live state before proposing changes.
5. Keep development history in `docs/PROJECT_LOG.md`; do not create scattered project logs.

## Unified State Machine

Move through these states in order. Re-enter at the earliest state invalidated by new evidence.

1. `ORIENT`: identify the requested surface, current live revision, assets, selectors, and last known defect.
2. `BRIEF`: define audience, visual language, safe areas, interaction, performance budget, and acceptance screenshot.
3. `SPEC`: express colors, assets, placement, activation, and load policy in structured theme or module data.
4. `ASSET`: generate or edit source art, remove backgrounds when needed, create display-sized runtime variants, and retain sources.
5. `MODULE`: change one ownership boundary at a time: CSS surface, renderer behavior, injector payload, launcher, or verification.
6. `STATIC_GATE`: run syntax checks, `macos/tests/run-tests.sh`, and the module matrix before live application.
7. `APPLY_ONCE`: prefer the existing CDP renderer and one-shot application; do not restart or start a daemon without a demonstrated lifecycle need.
8. `VISUAL_GATE`: verify computed state, interaction, screenshot geometry, readability, collision retreat, animation lifecycle, and absence of black-shell contamination.
9. `DECIDE`: accept and install only when gates pass; otherwise revert the smallest changed module and return to `SPEC` or `MODULE`.
10. `PACKAGE`: synchronize the installed engine, compare hashes, preserve setup and restore instructions, and update the canonical log.
11. `SUBMIT`: complete repository, public demo video, project description, category, feedback session ID, supported platform, and judge test path.

Never skip directly from `ASSET` or `MODULE` to `PACKAGE`.

## Work Routing

- For visual requests, start at `BRIEF`; use image generation or editing only for source art, then create a runtime-sized asset.
- For black frames, clipping, overlap, or flicker, start at `ORIENT`; inspect actual layers and recordings before changing opacity.
- For performance work, measure payload, decoded asset dimensions, DOM residency, timer frequency, and transfer reuse separately.
- For new controls or characters, define activation, retreat, cleanup, disable, and restore behavior before styling.
- For competition work, preserve one coherent product narrative and update `competition-manifest.json` evidence.

## Required Commands

Run the integrated runtime gate from the project root:

```bash
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime
```

Run the strict submission gate only when preparing the final Devpost entry:

```bash
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --submission
```

For live verification, use the existing project scripts. Apply once before considering daemon mode:

```bash
bash macos/scripts/start.sh --no-launch --once --port 9341 --wait-ms 8000
bash macos/scripts/verify.sh --port 9341
```

Use `macos/scripts/restore.sh --port 9341` for reversible removal. Do not modify the official app bundle, `app.asar`, signatures, authentication, API keys, or model settings.

## Acceptance Contract

Require all applicable checks:

- Working content remains readable and clickable.
- Theme layers stay below native text and controls.
- Sidebar, composer, titlebar, project panel, conversation, and decoration retain separate ownership.
- Background and character respect safe areas and retreat rules.
- Idle animation has no playback DOM or decoded playback asset.
- Global maintenance remains low frequency; transient polling exists only during an active interaction.
- Unchanged asset groups transfer zero asset bytes.
- Runtime files remain within `runtime-modules.json` budgets.
- Restore works without editing the official application.
- Source and installed engine hashes match after installation.
- The final screenshot and log identify the validated revision.

## Closeout

After code, asset, install, or submission work:

1. Complete every correctness-affecting item now.
2. Put broader decisions in `PRIORITY_INDEX` with owner, next action, and risk.
3. Put evidence-dependent items in `WATCH_LATER` with a revisit trigger.
4. Mark destructive or scope-expanding ideas `INTENTIONALLY_NOT_DO`.
5. Record the exact next resume point in `docs/PROJECT_LOG.md`.
