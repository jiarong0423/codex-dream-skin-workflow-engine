# Build Week Submission Checklist

Status date: 2026-07-20

## Ready

- Working macOS project
  - Evidence: runtime scripts, installer, launcher, verifier, restore path, and
    workflow gate exist.
- Primary category
  - Evidence: Developer Tools is the selected category; Work and Productivity is
    the user-value narrative.
- English README
  - Evidence: `README.en.md`.
- Public asset provenance
  - Evidence: `CREDITS.md`, `NOTICE.md`, and `submission/asset-inventory.json`.
- Demo video
  - Evidence: public YouTube URL `https://youtu.be/5viFZCJ57TQ`.
- Demo captions and timeline
  - Evidence: `submission/demo/codex-dream-skin-demo-short-en.srt`,
    `submission/demo/codex-dream-skin-demo-short-en.ass`, and
    `submission/demo/demo-timeline.json`.
- Demo interaction timeline
  - Evidence: `submission/demo/demo-timeline.json`.
- Clean storyboard frames
  - Evidence: `submission/demo/storyboard-frames.html`.
- Judge test path
  - Evidence: `README.en.md` and `README.md`.
- Public repository URL
  - Evidence:
    `https://github.com/jiarong0423/codex-dream-skin-workflow-engine`.
- Public YouTube URL
  - Evidence: `https://youtu.be/5viFZCJ57TQ`.
- `/feedback` session ID
  - Evidence: `019f706d-3b1a-7cb1-a1a6-42068bef79c1`.

## Still Requires External Action

- None before final Devpost submit.

## Before Publishing The Repository

- Do not include the excluded legacy code-rain orange-cat background.
- Do not include desktop screenshots, screen recordings, local paths, personal
  account names, or private task content.
- Keep the provenance notes for the small hacker-cat badge and table-flip
  animation in `CREDITS.md` and `submission/asset-inventory.json`.
- Run:

```bash
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime
bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --submission
```

The strict submission gate is expected to pass with the YouTube URL and
feedback session ID recorded.
