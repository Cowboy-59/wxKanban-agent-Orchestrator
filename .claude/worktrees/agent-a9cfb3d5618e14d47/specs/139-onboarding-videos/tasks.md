 done |# Tasks: Onboarding Videos

Source of truth for status is the DB (spec `0ea16073-d745-4ed9-9fee-fb29375dc2e4`). Fences use
`[SCOPE 139 / Tnnn]`.

## Task table

| Task | Title | FRs | Priority | Status |
|---|---|---|---|---|
| T001 | --video mode on wxHelpGenerate | FR-001 | high | done |
| T002 | Recording environment guard | FR-002 | critical | done |
| T003 | Demo-data attestation and seeded demo company | FR-003 | critical | done |
| T004 | Human-paced replay with click capture | FR-004 | high | done |
| T005 | HyperFrames composition | FR-005 | high | done |
| T006 | Length guard | FR-006 | low | done |
| T007 | Presenter options and consent attestation | FR-007 | medium | done |
| T008 | Staleness and --video --stale | FR-008 | high | done |
| T009 | Preflight and install-on-first-use of pinned HyperFrames | FR-009 | high | done |
| T010 | Zero-cost local rendering | FR-010 | medium | done |
| T011 | Web apps only messaging | FR-011 | low | done |
| T012 | Delivery and generation log | FR-012 | medium | done |
| T013 | Verify on fixtures, then the release run on wxHub (owner) | SC-1..SC-9 | critical | in_progress |
| T014 | Release and live verification | — | medium | done |

## Details

### T001 — --video mode on wxHelpGenerate (FR-001)

Add `--video` producing one Onboarding Video per SPEC-138 Teaching Skill for web apps by replaying its steps; each video records its lesson id and version (SC-1); without `--video` behavior is unchanged.

### T002 — Recording environment guard (FR-002)

Record only on an address on the UAT list (shared with SPEC-138's `environments` block). Refuse Production-listed and unlisted addresses, naming the classification and how to add a UAT address. Each video records its environment (SC-2). This is the data protection — video frames cannot be scanned for personal data.

### T003 — Demo-data attestation and seeded demo company (FR-003)

Before the first customer recording ask "Does this UAT hold demo data only?"; log the answer; re-ask when the UAT address changes; no answer or a no records nothing (SC-3). wxKanban's own videos use a seeded demo company (wxPreTest seeding).

### T004 — Human-paced replay with click capture (FR-004)

Playwright `recordVideo` replay with hover before clicks, pauses, readable typing, and a hold on each new screen (per-project pacing in the `video` config block); capture every click's screen position for the cursor overlay.

### T005 — HyperFrames composition (FR-005)

Compose a 1920x1080 MP4: oversized animated cursor (HyperFrames oversized-cursor) at recorded click positions; highlight or zoom on the element in use; captions and Kokoro narration from the lesson step text with footage fitted to narration; a chapter per step; an end card naming the lesson; project brand tokens. Confirm on the first recording that Playwright video carries no cursor (SC-4).

### T006 — Length guard (FR-006)

Flag any process whose video would exceed the length target (default about 3 minutes) for splitting; never speed it up (SC-5).

### T007 — Presenter options and consent attestation (FR-007)

Default narration only in a neutral Kokoro voice; optional brand mascot intro/outro composed in HyperFrames from brand art; customer-supplied presenter clips accepted only with a recorded consent attestation; never call a likeness-generating service.

### T008 — Staleness and --video --stale (FR-008)

Requires SPEC-137 and SPEC-138. Flag videos whose screens a change reaches; `--video --stale` re-records only those, keeping the paired lesson id and version in step (SC-6).

### T009 — Preflight and install-on-first-use of pinned HyperFrames (FR-009)

Before recording, check Node 22+ and FFmpeg and name what is missing; on first use install the pinned HyperFrames version (CLI via `npx` at the pinned version) with its Apache 2.0 notice; record the pin in the `video` config block; add "review the HyperFrames pin" to the release checklist (SC-8). HyperFrames is not bundled in the kit.

### T010 — Zero-cost local rendering (FR-010)

A default run renders locally and calls no paid service (network check in tests, SC-7); optional rendering on the customer's own cloud account; no footage sent to any wxKanban endpoint.

### T011 — Web apps only messaging (FR-011)

On desktop or mobile app types, state that video covers web apps only and record nothing (SC-9). Desktop and mobile video is reserved for a future scope.

### T012 — Delivery and generation log (FR-012)

wxKanban videos published through SCOPE-044's URL mechanism (S3 upload, set the URL) and an "Onboarding" group in `vscode-extension/src/services/videosCatalog.ts`; customer videos to `docs/onboarding-videos/` (gitignored); `onboarding_video_generated` Zod event type with who, when, environment, attestation, pinned version, and videos.

### T013 — Verify and the release run on wxKanban (SC-1..SC-9)

Environment refusal, attestation flow, frame checks for cursor/captions/narration, length guard, staleness through SPEC-137, network check for paid calls, clean-machine preflight, desktop refusal; the first `--video` run on wxKanban against the seeded demo company as the release test.

### T014 — Release and live verification (—)

Kit release with the generator verified in the published asset; app + MCP push with a hosted-MCP probe of the event type; Cockpit VSIX (Videos catalog group, Help text); S3 upload of wxKanban's videos via SCOPE-044. Follow-up: `/buildscope --edit 065` to point its deferred video note here.
