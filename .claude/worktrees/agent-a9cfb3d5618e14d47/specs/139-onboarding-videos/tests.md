# Test Plan: Onboarding Videos

**Spec**: SPEC-139 · [spec.md](spec.md) · [tasks.md](tasks.md)

## Success criteria → tests

| SC | Test | Kind | Task |
|---|---|---|---|
| SC-1 | Run `--video` on wxKanban, then compare the videos with the SPEC-138 lessons. Pass if there's one per web lesson and each records its lesson's id and version | Integration | T001, T013 |
| SC-2 | Point `--video` at a Production-listed address, then at an unlisted one. Both are refused with the classification stated, and nothing is recorded | Integration | T002 |
| SC-3 | With no attestation answer, then with a "no", nothing is recorded. Change the UAT address and the question is asked again | Integration | T003 |
| SC-4 | Sample frames from fixture videos. Every click shows the cursor, every step has a caption, and the narration text matches the lesson's step text | Frame check | T005 |
| SC-5 | Use a fixture process that runs about 5 minutes. It's flagged for splitting and is not sped up | Fixture | T006 |
| SC-6 | Change one fixture screen. Only its videos are flagged, `--video --stale` re-records only those, and each keeps its lesson id with the new version | Integration (needs 137 and 138) | T008 |
| SC-7 | Watch network traffic during a default run. There are no calls to paid video or avatar services | Integration | T010 |
| SC-8 | On a clean machine without FFmpeg, the preflight stops before recording and names what to install. A first run on a ready machine installs the pinned HyperFrames version | Clean-machine run | T009 |
| SC-9 | On a sample desktop app, `--video` says it covers web apps only and records nothing | Fixture | T011 |

## Per-requirement tests

| FR | Tests |
|---|---|
| FR-004 | Click positions are captured for every click. The pacing values in the configuration change the timing |
| FR-007 | A presenter clip without an attestation is refused. No likeness service is called |
| FR-009 | The pin is recorded in the project, and the Apache 2.0 notice is present after install |
| FR-012 | wxKanban's `/docs` player and the Cockpit Videos "Onboarding" group show the current release's videos. Each run writes one log record |

## Regression

- wxHelpGenerate without `--video`, and `--teach` (SPEC-138), produce unchanged output.
- After the push: probe the hosted MCP with an `onboarding_video_generated` event.
