# OpenAI Build Week Alignment

## Event Contract

- Event: OpenAI Build Week 2026.
- Deadline: July 21, 2026 at 5:00 PM PDT, equal to July 22, 2026 at 8:00 AM in Taipei.
- Primary track: Developer Tools.
- Value alignment: Work & Productivity.
- Official pages: `https://openai.com/zh-Hant/build-week/` and `https://openai.devpost.com/`.

## One Product, Two Evaluation Lenses

### Developer Tools

Codex Dream Skin is a developer-environment customization and verification tool. It turns a visual brief into a structured, reversible Codex desktop theme without patching the official application. Its technical contribution is the schema-driven module plan, content-hash cache, scoped CDP runtime, collision-aware presentation, automated verification, and restore path.

### Work And Productivity

The same product improves long-session comfort and focus through clearer area hierarchy, personal visual identity, reduced visual fatigue, safe decorative motion, and automatic retreat when content needs space. This is impact evidence, not a second submission.

## Problem Statement

Developer tools are visually rigid, while unsafe theming approaches can obscure controls, break layout, increase runtime load, or patch signed applications. Users need a way to personalize a serious work surface without sacrificing readability, stability, reversibility, or performance.

## Solution Statement

Codex Dream Skin combines Codex-assisted visual design with a structured runtime workflow: create a theme specification, optimize assets, activate only selected modules, apply through local CDP, verify actual UI geometry and interactions, and restore cleanly. The current cyber-mecha cat theme demonstrates the engine rather than defining its limit.

## Judging Alignment

- `Technological Implementation`: show non-trivial Codex-assisted debugging, module boundaries, caching, CDP integration, lifecycle cleanup, tests, and measured payload reduction.
- `Design`: show a coherent runnable experience with readable native controls, glass surfaces, safe-area art, character retreat, and manual animation.
- `Potential Impact`: show a reusable workflow for developers who spend long periods in Codex and want safe personalization.
- `Quality of the Idea`: emphasize theme creation as an agentic, testable workflow instead of a static CSS skin.

## Required Submission

- Working project using Codex and GPT-5.6.
- One selected category.
- Project description explaining the problem, workflow, architecture, and result.
- Public YouTube demo under three minutes with audio explaining Codex and GPT-5.6 usage.
- Repository URL for judging and testing.
- README with setup, supported platform, sample theme, run, verify, and restore instructions.
- `/feedback` Codex session ID for the task containing most core implementation work.
- For the developer tool: installation instructions and a judge test path that does not require rebuilding.

## Language Requirement

- All submission materials must be in English or include an English translation.
- If the demonstration video uses a non-English voice track, provide a complete English translation for the video and all submitted text and testing instructions.
- Recommended delivery for this project: English TTS narration with Simplified Chinese subtitles using Taiwan-neutral terminology.

## Demo Storyboard Under Three Minutes

1. `0:00-0:20`: show native Codex and state the personalization and safety problem.
2. `0:20-0:45`: provide a visual brief or image and show the structured theme modules.
3. `0:45-1:15`: run the gate and one-shot apply without patching the official app.
4. `1:15-1:45`: show sidebar, glass composer, right panel, character retreat, and manual table-flip interaction.
5. `1:45-2:15`: show WebP compression, asset-group cache reuse, low-frequency runtime, tests, and restore.
6. `2:15-2:40`: explain how Codex and GPT-5.6 generated assets, diagnosed screenshots and recordings, refactored the runtime, and maintained evidence.
7. `2:40-2:55`: show restore and the reusable workflow promise.

## Judge Test Path

1. Use macOS with the supported Codex desktop application installed.
2. Run `bash macos/tests/run-tests.sh`.
3. Run `bash macos/scripts/install.sh`.
4. Run the installed launcher or documented one-shot path.
5. Run `bash macos/scripts/verify.sh`.
6. Run `bash macos/scripts/restore.sh --port 9341`.

Do not claim Windows support in this submission.
