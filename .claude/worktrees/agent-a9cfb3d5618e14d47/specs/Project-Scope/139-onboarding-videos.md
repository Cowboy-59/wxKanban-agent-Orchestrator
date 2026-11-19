# Scope 139: Onboarding Videos

**Scope Number**: 139
**Status**: `draft`
**Created**: 2026-10-17
**Depends On**: SCOPE-138 (Teaching Skill steps are the recording script; shared UAT/Production lists), and through it SCOPE-137 (Change Impact for staleness)
**Related Scopes**: SCOPE-044 (/docs video player), SCOPE-065 (deferred video generation — this is that scope), SCOPE-042 / SCOPE-066 (Cockpit Videos panel)
**Implemented By**: SPEC-139 (`specs/139-onboarding-videos/`)
**Source**: `specs/Project-Scope/139-onboarding-videos.md` — converted from `docs/brainstorms/2026-10-16-onboarding-videos.md`

## Overview

**Onboarding Videos** let new users see each process of an app, with no one recording by hand.

`/wxHelpGenerate --video` replays each Teaching Skill's steps (SCOPE-138) in **UAT** with Playwright
at human speed. HyperFrames (Apache 2.0, free) composes the footage into a branded MP4 with
captions, an oversized animated cursor, highlights, and Kokoro narration taken from the lesson text.

- **Pairing and staleness:** each video is paired with its lesson at the same version. SCOPE-137's
  Change Impact flags only the videos whose screens change, and `--video --stale` re-records just
  those.
- **Recording safety:** recording is refused in Production and on unknown addresses, and a customer
  must attest that UAT holds demo data only. wxKanban's own videos are recorded against a seeded demo
  company.
- **Presenter:** narration only by default, with an optional brand mascot. A real person appears
  only in clips the customer supplies, with a consent attestation.
- **Tooling and cost:** HyperFrames installs on first use at a pinned version, after a preflight for
  Node 22+ and FFmpeg. Rendering is local at zero per-video cost, and no footage passes through
  wxKanban.
- **Coverage:** web apps only. Desktop and mobile video is reserved for a future scope.
- **Where videos play:** wxKanban's videos play in the `/docs` player and the Cockpit Videos panel.
  Customers host their own.

This is the video-generation scope SCOPE-065 deferred.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Video generator — a kit customer's developer, or wxperts for wxKanban |
| **Secondary Actors** | Viewer — an end user learning the app |
| **Key Value** | Accurate, current how-to videos at no per-video cost, matching the lessons step for step. |
| **Scope Boundary** | IN: /wxHelpGenerate --video producing one Onboarding Video per Teaching Skill (SCOPE-138) for web apps by replaying its steps; the recording-environment guard (UAT list only; Production and unlisted refused); the demo-data attestation per UAT address (wxKanban's own videos use a seeded demo company); human-paced Playwright replay with click-position capture; HyperFrames composition (oversized cursor, highlight, captions and Kokoro narration from the lesson text, chapters per step, end card, brand tokens, 1920x1080 MP4); the length guard; presenter options (narration default, optional brand mascot, customer-supplied clips only with consent attestation); staleness and --video --stale via SCOPE-137; install-on-first-use of a pinned HyperFrames version with a Node 22+/FFmpeg preflight; zero-cost local rendering; web-apps-only messaging; delivery (SCOPE-044 player and Cockpit Videos panel for wxKanban; docs/onboarding-videos for customers) and a generation log. |

## Business Problem

New users need to see how to get around an app. Today, how-to videos are recorded by hand: each one
costs time, goes stale when screens change, and drifts from the written lessons. A customer (meeting
2026-10-16) proposed recording a browser agent using the app and turning the footage into branded
onboarding videos.

wxKanban already has every piece separately:

- HyperFrames video skills (installed only on the developer's machine, not shipped)
- an agent that drives the app (screenshots only)
- Playwright (video only on test failure)
- Kokoro narration
- a video player (SCOPE-044, where producing videos is "out of band")

What's missing is the link: nothing records an agent's signed-in walk of a process as motion
footage, so nothing can feed the video tools. SCOPE-065 explicitly deferred video generation to its
own scope.

## Out of Scope

- Desktop and mobile app video (reserved for a future scope).
- Marketing videos (SCOPE-065's domain).
- wxKanban generating a real person's likeness.
- Generative video tools (Pika, Veo) for screen footage.
- Rendering customer videos on wxKanban servers.
- Hosting customers' videos.
- Any database schema change.

## User Scenarios & Testing

### US1 — Generate videos for a customer's web app

**Actor**: Kit customer's developer

1. Runs /wxHelpGenerate --video.
2. The preflight finds Node 22 and FFmpeg; the pinned HyperFrames version installs on this first run.
3. It asks "Does this UAT hold demo data only?"; they say yes and the answer is logged.
4. For each Teaching Skill, the steps are replayed on the UAT address at human speed and recorded.
5. Each recording is composed into an MP4 with captions, cursor, highlights, Kokoro narration, and an end card naming its lesson.

**Expected outcome**: One video per lesson (SC-1), all with cursor, captions, and narration (SC-4), at zero cost (SC-7).

### US2 — Refused in Production

**Actor**: Developer who points --video at the live site by mistake

1. The address matches the Production list; recording is refused with the reason.
2. Separately, an address on neither list is refused the same way.

**Expected outcome**: Nothing is recorded outside UAT (SC-2).

### US3 — Only changed screens re-recorded

**Actor**: Customer's developer

1. The Invoice screen changes; SCOPE-137 flags its lesson and video.
2. They run --teach --stale then --video --stale; only the Invoice lesson is regenerated and only its video re-recorded, with the same lesson id and the new version.

**Expected outcome**: Video and lesson stay paired; nothing else is touched (SC-6).

### US4 — Customer-supplied presenter

**Actor**: Customer's developer

1. Adds an intro clip of their own person made with their own HeyGen account.
2. The generator records their consent attestation and places the clip at the start of each video.

**Expected outcome**: wxKanban never generates the likeness; the clip and the consent are the customer's.

### US5 — Edge cases

**Actor**: Developer

1. A process runs about 5 minutes; it is flagged for splitting, not rushed (SC-5).
2. On a machine without FFmpeg, the preflight stops before recording and names what to install (SC-8).
3. On a desktop app, --video says video covers web apps only and records nothing (SC-9).

**Expected outcome**: Each edge case fails safe and says why.

## Functional Requirements

### FR-001 — --video on wxHelpGenerate

/wxHelpGenerate --video produces one Onboarding Video per Teaching Skill for web apps by replaying that lesson's steps.

**Acceptance Criteria**:
- [ ] SC-1 holds: 100% coverage, each video recording its lesson id and version.
- [ ] A run without --video behaves as before.

### FR-002 — Recording environment guard

Recording runs only on an address on the UAT list; a Production-listed or unlisted address is refused with the reason. Each video records the environment it was made in.

**Acceptance Criteria**:
- [ ] SC-2 holds.
- [ ] The refusal names the address's classification and how to add a UAT address.

### FR-003 — Demo-data attestation

Before the first recording of a customer app, the generator asks whether the UAT holds demo data only, records the answer in the generation log, and asks again whenever the UAT address changes. wxKanban's own videos record against a seeded demo company instead.

**Acceptance Criteria**:
- [ ] SC-3 holds.
- [ ] No answer, or a no, records nothing.
- [ ] wxKanban's runs use the seeded demo company.

### FR-004 — Human-paced replay with cursor capture

Playwright replays each step at human speed (hover before clicks, pauses, readable typing, a hold on each new screen) and records every click's screen position. Pacing defaults are set per project.

**Acceptance Criteria**:
- [ ] Every click position is captured.
- [ ] Pacing values are configurable and applied.

### FR-005 — Composition

HyperFrames composes each recording into a 1920x1080 MP4: the oversized animated cursor at the recorded click positions; a highlight or zoom on the element in use; captions and Kokoro narration from the lesson's step text with the footage fitted to the narration; a chapter per step; an end card naming the paired lesson; the project's brand tokens.

**Acceptance Criteria**:
- [ ] SC-4 holds.
- [ ] Narration and captions match the lesson's step text.

### FR-006 — Length guard

A process whose video would exceed the project's length target (default about 3 minutes) is flagged for splitting.

**Acceptance Criteria**:
- [ ] SC-5 holds.

### FR-007 — Presenter options

Narration only, in a neutral voice, is the default; an animated brand mascot for intro and outro is optional; customer-supplied presenter clips are accepted only with a recorded consent attestation. The generator never creates a real person's likeness.

**Acceptance Criteria**:
- [ ] A clip without an attestation is refused.
- [ ] No likeness-generating service is called.

### FR-008 — Staleness and --video --stale

SCOPE-137 Change Impact flags the videos whose screens a change reaches; --video --stale re-records only those, keeping each paired lesson id and version in step.

**Acceptance Criteria**:
- [ ] SC-6 holds.

### FR-009 — Install on first use and preflight

Before recording, a preflight checks Node 22+ and FFmpeg and names anything missing. The first --video run installs a pinned HyperFrames version, keeping its Apache 2.0 notice.

**Acceptance Criteria**:
- [ ] SC-8 holds.
- [ ] The pinned version is recorded in the project.
- [ ] The release checklist includes reviewing the pin.

### FR-010 — Zero-cost local rendering

A default run renders locally and calls no paid service; customers may opt into rendering on their own cloud account. No footage is sent to wxKanban.

**Acceptance Criteria**:
- [ ] SC-7 holds.
- [ ] No footage is sent to any wxKanban endpoint.

### FR-011 — Web apps only

On a desktop or mobile app type, --video states that video covers web apps only and records nothing; desktop and mobile video is reserved for a future scope.

**Acceptance Criteria**:
- [ ] SC-9 holds.

### FR-012 — Delivery and generation log

wxKanban's videos are published to the SCOPE-044 /docs player and the Cockpit Videos panel each release; customers' videos are written to docs/onboarding-videos/ (gitignored) for them to host. Each run is logged through project.capture_event as onboarding_video_generated with who, when, environment, attestation, and the videos produced.

**Acceptance Criteria**:
- [ ] wxKanban's player shows the current release's videos.
- [ ] Every run produces one log record.

### FR-013 — Shared Entry Path (Amendment A, 2026-10-18)

Recording starts where the user starts: for a portal-hosted app, the video signs in through the portal (with the saved demo session, or SCOPE-140's test-account sign-in; a password is never typed on screen) and shows opening the app from the portal before the lesson's steps. It uses the same `entryPath` as SCOPE-138 and SCOPE-140, and the portal's addresses pass the same recording environment guard.

**Acceptance Criteria**:
- [ ] A portal-hosted app's video opens with the portal and the hand-off to the app.
- [ ] No password or authenticator code is ever visible in a recording.
- [ ] A portal address on the Production list, or on neither list, is refused like any other.

## Data Requirements

**No new table and no DDL.** One Zod event type, `onboarding_video_generated`, is added to the
existing `events` table, alongside SCOPE-137's and SCOPE-138's types. Its `metadata` holds who,
when, the environment, the demo-data attestation, the pinned HyperFrames version, and the videos
produced (with their lesson ids and versions).

`docs-workspace/config.json` gains a `video` block:

- pacing values and the length target
- mascot on or off
- presenter clips, each with its consent attestation
- the demo-data attestation for each UAT address
- the pinned HyperFrames version

Files:

- `docs/onboarding-videos/<process>.mp4` is build output and gitignored. Customers host their own.
- wxKanban's own videos are published through SCOPE-044's existing URL mechanism (upload to S3, then
  set the URL) as a release step. Nothing new is stored.

## API Routes

MCP: no new tool — `project.capture_event` accepts `onboarding_video_generated`.
App: none new — SCOPE-044's /docs player already serves video URLs.

## Frontend Components

App: none new — videos appear in the existing /docs player.
Cockpit: the Videos panel catalog (`videosCatalog.ts`) gains an "Onboarding" group listing wxKanban's process videos; the wxHelpGenerate Help entry mentions `--video` and `--video --stale`.

## Success Criteria

1. SC-1: A --video run on wxKanban produces one video per Teaching Skill for its web processes (100% coverage), each recording its paired lesson id and version.
2. SC-2: Recording against a Production-listed or unlisted address is refused 100% of the time.
3. SC-3: No recording happens for a customer app until the demo-data attestation is yes; it is re-asked whenever the UAT address changes.
4. SC-4: Every video shows the animated cursor on 100% of clicks, captions on every step, and narration from the lesson text.
5. SC-5: 0 processes over the length target are rendered without being flagged for splitting.
6. SC-6: A change reaching one screen flags only the videos showing that screen (0 extra, 0 missed), and --video --stale re-records only those.
7. SC-7: Zero per-video cost: no paid service is called during a default run.
8. SC-8: Without Node 22+ or FFmpeg, the preflight stops before recording and names what to install; the first run installs the pinned HyperFrames version.
9. SC-9: On a desktop or mobile app, --video states video covers web apps only and records nothing.

## Key Entities

**Onboarding Video** — a short branded video of one process, generated by replaying its Teaching Skill's steps in UAT; paired with that lesson at the same version; never recorded in Production (CONTEXT.md).
**Recording environment** — the UAT and Production address lists shared with SCOPE-138.
**Demo-data attestation** — recorded per UAT address; required before recording a customer app.
**Presenter clip** — customer-supplied, with a consent attestation.
**Pinned HyperFrames version** — the installed-on-first-use version, reviewed each release.

## Constraints

**Delivery**

1. **One complete release,** sequenced after SCOPE-138 and therefore after SCOPE-137. The first
   `--video` run on wxKanban, against the seeded demo company, is the release test.
2. **Channels:**
   - the kit (the generator)
   - the app + MCP push (the event type)
   - the Cockpit VSIX (the Videos catalog group and Help text)
   - S3 uploads of wxKanban's videos each release, through SCOPE-044

**Technical**

3. **UAT-only recording is the data protection.** Video frames can't be scanned for personal data, so
   no flag may bypass the environment guard or the attestation.
4. **Cursor:** Playwright video is believed to carry no cursor. Confirm this on the first recording.
5. **HyperFrames is pinned** and the pin is reviewed each release. It requires Node 22+ and FFmpeg.
6. **Generative video tools are never used for screen footage.**
7. **No schema change.** The event type is Zod-only.

**Boundary**

8. **SCOPE-065** gets a pointer from its deferred "video generation" note to this scope.

## Compliance Requirements

### SOC 2

- **CC7.2:** generation is logged with who, when, the environment, and the attestations (FR-012).
- **Confidentiality:** recording happens in UAT only, with demo data attested (FR-002, FR-003).
- **Likeness:** consent is recorded and is owned by the customer (FR-007).

## Notes

- Uses HyperFrames (Apache 2.0, installed on first use at a pinned version), Playwright, Kokoro, and project.capture_event. Extends the wxHelpGenerate kit skill (home established by SCOPE-138).
- Customer questions for the reply: an avatar of their person would be their own HeyGen clip, used with that person's written consent; marketing videos are a separate topic.
- Converted from `docs/brainstorms/2026-10-16-onboarding-videos.md` (group 3 of a customer meeting, 2026-10-16).

## Clarifications

### Session 2026-10-16

| # | Question | Decision |
|---|----------|----------|
| 1 | Reuse check | No existing scope covers it (closest SCOPE-003, admin account onboarding). New scope. |
| 2 | Terminology | Onboarding Video added to CONTEXT.md. |
| 3 | Desktop and mobile apps | (a) Web apps only; desktop and mobile video reserved for a future scope. |
| 4 | Who guarantees UAT holds demo data | Customer apps: attestation, re-asked when the UAT address changes; no yes, no recording. wxKanban: a seeded demo company. |
| 5 | Shipping HyperFrames | Install on first use at a pinned version (changed from bundling in the kit). |
| 6 | Success criteria | SC-1 to SC-9 as listed. |

### Session 2026-10-18 (Amendment A)

| # | Question | Decision |
|---|----------|----------|
| 7 | Shared Entry Path (Amendment A, 2026-10-18) | Recording for a portal-hosted app starts at the portal, using the shared `entryPath` in docs-workspace/config.json that SCOPE-140 defines; FR-013 added. Approved by the owner on 2026-10-18. |
