# Verification: Onboarding Videos

**Spec**: SPEC-139 · **Task**: T013 (fixture part) · **Run**: 2026-10-17

The owner runs the release test on wxHub. Nothing here was run against wxKanban's app or database.

## Live, end to end, on a throwaway fixture app

A small invoice app served locally; a lesson built by the real `teach.mjs build`; then the real
`video.mjs record`: a Playwright recording, local Kokoro narration through `hyperframes tts`, and a
HyperFrames 0.8.113 render installed on first use (130 s including the install).

| Check | Result |
|---|---|
| Output | `create-an-invoice.mp4`: H.264 1920x1080 with an AAC narration track, 22.3 s; narration audible (mean -22.8 dB) |
| Pairing | `.videos.json` records lesson `create-an-invoice` v1, app 2.0.0, environment UAT, the attestation, pin 0.8.113 |
| Cursor (Constraint 4) | **Confirmed**: the raw Playwright footage has no cursor. The composition draws the oversized cursor at all 4 recorded clicks |
| Captions and chapters | Each step's caption is the lesson's own text ("Click New invoice. The New invoice form opens.", "In Amount, type 125.00."), with "Step n of 4" |
| End card | Names the lesson and its version |
| Notices and pin | `THIRD-PARTY-NOTICES.md` (Apache 2.0); the pin written to `docs-workspace/config.json` |

**Found and fixed from the frames:** a click-pulse ring showed before its click (GSAP `fromTo`
renders its start at load; now `immediateRender: false`), and a highlight lingered after a click
that changed the page, framing the wrong field (it now ends just after the click). Both re-rendered
and checked.

## Success criteria on fixtures (tests/unit/onboarding-videos.test.ts)

| SC | Result |
|---|---|
| SC-1 | **Pass**. One video per lesson, in a real browser against a fixture app, every click captured (3 and 1), each paired with its lesson id and version |
| SC-2 | **Pass**. A Production-listed and an unlisted address are refused with the classification and how to add a UAT address; no browser starts |
| SC-3 | **Pass**. No answer or a "no" records nothing; a different UAT address is asked again; a seeded demo company replaces the question; every answer is logged |
| SC-4 | **Pass**. The composition has a cursor move per click, a caption and a narration clip per step, chapters, and an end card naming the lesson (and live, above) |
| SC-5 | **Pass**. Over the target is flagged for splitting, never sped up |
| SC-6 | **Pass**. Only a lesson whose version moved, that Change Impact flagged, or with no video is re-recorded; then "no video is stale" |
| SC-7 | **Pass**. A full recording run makes no `fetch` call; telemetry is off; narration and rendering are local. The log record carries no footage |
| SC-8 | **Pass**. Node below 22, no FFmpeg, no Playwright are each named; on this machine the real `check` named FFmpeg (it is not on the PATH here) |
| SC-9 | **Pass**. A desktop or mobile app records nothing and says video covers web apps only |

## Also checked

- Presenter clips are refused without a consent attestation; the generator calls no
  likeness-generating service (the source is scanned for one in a test).
- `onboarding_video_generated` passes the MCP schema for a run and for a refusal.
- `docs/onboarding-videos/` and the saved recording session are added to `.gitignore`.
- The two wxHelpGenerate copies are identical byte for byte; the Cockpit Help lists `--video` and
  `--video --stale`; the Videos section leads with an Onboarding group (`onboarding-` slugs).
- The kit release prints "review the HyperFrames pin" with the newest published version.
- Suites: 239 tests across SPEC-137..140 pass together (twice in a row); MCP and Cockpit typecheck
  clean; `auditfences` finds nothing new (legacy files re-hashed surgically, each with an amendment).
  One run saw an intermittent failure in the SPEC-138 staleness test under full parallel load; it
  did not reproduce in three reruns. The shared test timeout was raised to 20 s for engine and
  browser suites.

## Open (owner)

- The release test on wxHub: `/wxHelpGenerate --teach`, then `--video`, on its UAT.
- wxKanban's own videos: generate against a seeded demo company, upload through SCOPE-044 under
  `onboarding-<lesson id>` slugs (they then appear in /docs and the Cockpit Onboarding group).
- Follow-ups: `/buildscope --edit 139` (shared Entry Path) and `/buildscope --edit 065` (point its
  deferred video note here).

## Release (T014), 2026-10-17

| Channel | Shipped | Verified how |
|---|---|---|
| App + MCP (push `660a2e38..e2a8b2b3`, commit `c3ae156a`) | App 1.5.342; MCP: start_test_run dryRun/itemIds/subjects; nightly_run_completed, compliance_artifact_written, onboarding_video_generated | Both App Runner deploys **SUCCEEDED**; `/api/version` reports 1.5.342. Live `start_test_run` with `dryRun` returned 153 items with subjects and opened no run. Each new event type was accepted as a type and refused only for its probe metadata (nothing written); an unknown type is refused as a type |
| Kit v1.7.81 (GitHub release) | nightly.mjs and nightly/, video.mjs (both copies), skills, preTest and wxHelpGenerate commands | Published assets byte-match the local build. In the downloaded archive: the nightly modules, identical video.mjs copies, the --nightly and --video Help flags, version 1.7.81, none of the orchestrator's uncommitted SCOPE-068 work (set aside and restored byte for byte). The published nightly.mjs and video.mjs ran their checks. The release printed the HyperFrames pin review (0.8.113; newest 0.8.169) |
| Cockpit 0.2.43 (Marketplace) | Nightly morning summary card; Onboarding videos group | The packaged bundle contains the card, the onboarding- grouping and the last-summary reader; published |
