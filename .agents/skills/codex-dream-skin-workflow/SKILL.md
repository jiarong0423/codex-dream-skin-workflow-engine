---
name: codex-dream-skin-workflow
description: Design, implement, debug, validate, package, or submit Codex Dream Skin themes through one safe workflow. Use for Codex desktop skin, theme, background, glass UI, icon, character, animation, collision retreat, CDP injection, performance reduction, rollback, Build Week submission, demo, README, or release-gate work in the Codex Dream Skin project.
---

# Codex Dream Skin Workflow

Treat Codex Dream Skin as one product: a schema-driven workflow engine for safely designing, applying, testing, and reverting personalized Codex desktop themes. Do not split the developer-tool implementation from the productivity story.

## Pinned Revision Loop

Before any visual, theme-pack, renderer, injector, launcher, packaging, or
budget revision, read `docs/PINNED_REVISION_LOOP_STANDARD.md` and run its
decision loop. That file is the canonical post-revision architecture for:

- exact-route black-layer scanning
- replacement-only owner repair
- budget compression
- one-shot injection
- restore readiness
- final evidence logging

If the pinned loop conflicts with an older log entry, follow the pinned loop
and record the conflict in `docs/PROJECT_LOG.md`.

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
6. `STATIC_GATE`: run the approved syntax, test, and module-matrix checks from `package-runner-allowlist.md` before live application.
7. `APPLY_ONCE`: prefer the existing CDP renderer and one-shot application; do not restart or start a daemon without a demonstrated lifecycle need.
8. `VISUAL_GATE`: verify computed state, interaction, screenshot geometry, readability, collision retreat, animation lifecycle, and absence of black-shell contamination.
9. `DECIDE`: accept and activate only when gates pass; otherwise revert the smallest changed module and return to `SPEC` or `MODULE`.
10. `PACKAGE`: synchronize the installed engine, compare hashes, preserve setup and restore instructions, and update the canonical log.
11. `SUBMIT`: complete repository, public demo video, project description, category, feedback session ID, supported platform, and judge test path.

Never skip directly from `ASSET` or `MODULE` to `PACKAGE`.

## Work Routing

- For visual requests, start at `BRIEF`; use image generation or editing only for source art, then create a runtime-sized asset.
- For black frames, clipping, overlap, or flicker, start at `ORIENT`; inspect actual layers and recordings before changing opacity.
- For black or near-black surfaces, classify the live candidates through `docs/KNOWN_BLACK_RANGE_LEDGER.json` and `docs/SURFACE_GAP_MATRIX.json` before editing CSS or renderer code.
- For performance work, measure payload, decoded asset dimensions, DOM residency, timer frequency, and transfer reuse separately.
- For new controls or characters, define activation, retreat, cleanup, disable, and restore behavior before styling.
- For competition work, preserve one coherent product narrative and update `competition-manifest.json` evidence.

## Post-Revision Layer Scan Rule

After every visual, theme-pack, renderer, injector, launcher, or runtime module revision, run this rule before package, release, or handoff. If CDP or screenshot access is unavailable, record the blocker and stop at `VISUAL_GATE` instead of packaging.

1. Scan the exact live route, panel, menu, and composer state that was changed; do not substitute a clean route for a reported broken surface.
2. Always prioritize the user-reported black-layer hot spots before declaring the scan clean: bottom composer and adjacent message action strip, plus/add menu popover, right environment/source header bars, and the large right-side browser/webview or command-palette shell. Open reversible UI states and capture screenshots for these surfaces when they are present.
3. Run the black-shell layer audit against the live CDP renderer and keep the screenshot evidence path with the revision id.
4. Compare every near-black candidate against `docs/KNOWN_BLACK_RANGE_LEDGER.json` and `docs/SURFACE_GAP_MATRIX.json`.
5. Classify each candidate as `RETAIN_NATIVE`, `PROTECTED`, `CONTROLLED`, `DIRTY_LAYER_SUSPECT`, `MODIFICATION_CANDIDATE`, or `INDEPENDENT_REVIEW`.
6. Treat coordinates as evidence only; ownership identity must come from DOM ancestry, semantic role, theme markers, native surface role, and interaction state.
7. If `unmarkedNearBlackShells` is greater than zero, repair or add the named owner row before widening a global selector or changing palette opacity.
8. Multi-layer scan is mandatory: for each candidate, report the exact black layer among element `background-color`, `background-image`, `box-shadow`, `filter`, `backdrop-filter`, `::before`, and `::after`; do not call an owner clean when a pseudo or shadow layer is still black.
9. Repair means replacement, not overlay. Replace the existing owner rule or owner marker so native black paint becomes `transparent`/`none`; do not add a new translucent panel, blur, gradient, or alpha fill to hide the black layer.
10. Do not append a new selector for every screenshot. If the same owner recurs, consolidate into the existing owner selector, or fix renderer ownership marking so the existing selector applies.
11. Change only one named ownership boundary per pass: `blackShellTransparency`, `pageHeaderShell`, `routeSearchBand`, `composerSurface`, `inputEditorShell`, `conversationSurface`, `projectListRows`, `transientMenuShell`, `workspacePicker`, or private overlay material.
12. If only protected native surfaces remain, do not report them as missing theme assets; apply a protected-surface luminance budget or owner-scoped material tuning.
13. Record the evidence directory, candidate counts, protected/controlled/unmarked status, direct cause, root cause, fix, validation commands, and exact next resume point in `docs/PROJECT_LOG.md`.

## Approved Execution Boundary

Read `package-runner-allowlist.md` before executing any project command. Only the exact allowlisted commands may run, and every live UI action requires explicit operator approval for the current task. Use the documented reversible removal entrypoint after an approved live check. Do not modify the official app bundle, `app.asar`, signatures, authentication, API keys, or model settings.

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
- Every post-revision visual closeout reports layer-owner classification and whether `unmarkedNearBlackShells` is zero.
- Package, release, and handoff are blocked unless the post-revision layer scan rule passed or its CDP/screenshot blocker is recorded.

## Closeout

After code, asset, activation, or submission work:

1. Complete every correctness-affecting item now.
2. Put broader decisions in `PRIORITY_INDEX` with owner, next action, and risk.
3. Put evidence-dependent items in `WATCH_LATER` with a revisit trigger.
4. Mark destructive or scope-expanding ideas `INTENTIONALLY_NOT_DO`.
5. Record the exact next resume point in `docs/PROJECT_LOG.md`.
