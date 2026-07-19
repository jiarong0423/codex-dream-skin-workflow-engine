# Failure Prevention Guardrails

## Selector And Layer Safety

- Never use a broad selector because a screenshot area appears uniformly dark.
- Inspect the element, pseudo-elements, painted descendants, ancestors, and independent sticky siblings.
- Distinguish geometry defects from color defects. Fix width, height, inset, overflow, or ownership before opacity.
- Keep decoration below content and set `pointer-events: none` unless the element is an explicit control.
- Do not style assistant processing, status chips, or right-panel text as user messages.
- Do not place a full-page mask, blur, or wallpaper over the conversation workspace.

## Runtime Stability

- Prefer stable native selectors for stable surfaces; do not wait for a periodic class to style the composer.
- Do not mutate stable visual surfaces every maintenance tick.
- Keep light maintenance at 2500 ms and heavy maintenance at 10000 ms unless profiling proves a need.
- Use event hooks, bounded follow-up checks, and shared observers before adding polling.
- Make every injected element idempotent and removable.

## Asset Safety

- Retain design sources and select a display-sized runtime variant.
- Generate transparent cutouts for foreground characters and icons.
- Use WebP for large raster runtime backgrounds after visual comparison.
- Do not preload manual animation playback; load on trigger and release after completion.
- Do not duplicate the orange cat character across unrelated buttons; use semantic symbols.

## Live Application

- Read the active session and CDP state before launching anything.
- If port 9341 and an injectable renderer exist, use one-shot apply without restart.
- Restart only when CDP is absent and the user has authorized it.
- Never modify the official app bundle, `app.asar`, code signature, auth data, API keys, base URL, or model settings.
- Keep CDP bound to `127.0.0.1`.
- Verify restore before calling a release ready.

## Performance Claims

- Separate file bytes, serialized transfer bytes, decoded image memory, DOM residency, renderer CPU, and GPU memory.
- Do not claim an exact CPU or RAM reduction without matched workload samples.
- Reject runtime files that exceed manifest budgets.
- Treat an unchanged live application with nonzero asset transfer as a cache regression.

## Known Direct And Root Causes

- Black composer flicker direct cause: periodic runtime reinstallation. Root cause: a stable surface was owned by polling instead of CSS.
- Character recovery delay direct cause: repeated hold extension. Root cause: active collision and grace state shared one branch.
- Large payload direct cause: design sources used as runtime assets. Root cause: source and runtime ownership were coupled.
- Animation retention direct cause: playback existed before click or depended on throttled callbacks. Root cause: idle, playback, and cleanup were not separate lifecycle states.
- Right-panel masking direct cause: a broad frame selector. Root cause: panel chrome and the major native column were treated as one object.

## Stop Conditions

Stop live application and return to diagnosis when any condition occurs:

- Native text, plus buttons, model controls, or panel rows disappear.
- A theme layer changes workspace dimensions or intercepts pointer input.
- Composer or panel geometry differs from the native bounding box.
- Flicker repeats at a maintenance interval.
- The character overlaps text or remains hidden without a collision.
- Restore fails or the current renderer cannot be identified.
