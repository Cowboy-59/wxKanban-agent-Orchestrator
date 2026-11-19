# Brainstorm: Onboarding videos generated from the real app

- **Status:** closed
- **Opened / last updated:** 2026-10-16 / 2026-10-16
- **Source:** customer meeting notes, 2026-10-16 (group 3 of 4)
- **Asked for by:** one customer
- **Level:** senior

## The request

The meeting notes propose:

- A browser AI agent uses the app as a real user would, and that run is recorded.
- The AI writes a prompt that feeds the footage into a video tool (HeyGen, Pika, or Veo were named)
  to produce polished, branded, step-by-step onboarding videos.
- Optionally, an animated version of one of their own people delivers short segments.

The notes call this "a strong asset to build now, with further uses later". Their key takeaway:
the lessons from group 2 and these videos together form a scalable, largely automated onboarding
system.

**The need behind it, as agreed:** each process of an app gets a short, branded, step-by-step video
generated automatically from the real app, so new users can see how it's done without anyone
recording by hand. Each video pairs with that process's Teaching Skill (SCOPE-138) at the same
version and is regenerated when the screens change. It is for onboarding; marketing uses are out of
scope.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| **HyperFrames video skills** (product-launch, explainer, slideshow, captions, oversized cursor, motion graphics) | Built. Installed only on the developer's machine: symlinked from the gitignored `.agents/`, not tracked, not in the kit allowlist | `.claude/skills/hyperframes*` symlinks; `scripts/sync-to-orchestrator.mjs` allowlist | Confirmed |
| HyperFrames license | Apache 2.0; no per-render fees, seat caps, or company-size limits. Requires Node 22+ and FFmpeg | Public sources (see the 2026-10-16 discussion) | Likely |
| `hyperframes capture` | Static snapshot of a site only; no sign-in, no clicking | `product-launch-video/SKILL.md:59` | Confirmed |
| An agent driving the real app by role | Screenshots only, no motion recording | `.claude/skills/run-wxkanban/driver.mts:168` | Confirmed |
| Playwright video | Recorded on test failure only | `playwright.config.ts:39` | Confirmed |
| Narration | Kokoro (local, free) is the default. The HeyGen account has no voice credits | memory `reference_hyperframes_setup` | Confirmed |
| Animated presenter | Paid HeyGen avatar route only, untested here | `media-use/references/operations.md:209` | Likely |
| Hosting and playing videos | `/docs` video player (SCOPE-044) and the Cockpit Videos panel; producing videos is "out of band" | `044-landing-docs.md:52,197` | Confirmed |
| A video-generation scope | Not found. SCOPE-065 deferred "video generation" to its own later scope | `065-marketing-ai-assist.md:24` | Confirmed |

**Costs researched 2026-10-16** (from third-party pages; verify against each vendor's own page):

- **HeyGen:** Creator $29/month (600 credits); Pro from $49; Business $149 plus $20 per seat. The
  API is priced separately.
- **Pika:** Standard about $8–10/month; Pro $28–35; Fancy $76–95.
- **Veo 3.1:** $0.05–0.60 per second of video.
- **Remotion:** requires a paid company license above 3 employees.
- **Free and permissive:** HyperFrames, FFmpeg, and Kokoro.

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Security, Frontend, DevOps, Documentation · Sat out:
Legacy, Database, Backend, Migration, QA

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | Each process of an app gets a short, branded, step-by-step video generated automatically from the real app. It pairs with its Teaching Skill at the same version, is regenerated when the screens change, and is for onboarding only (marketing is out of scope) | Agreed | yes | 2026-10-16 |
| 2 | Who | **Both:** wxKanban's own users (videos play in the SCOPE-044 `/docs` player and the Cockpit Videos panel) and kit customers (the same generator run on their app; they host their own videos). One generator, no hand-made wxKanban set | Agreed | yes | 2026-10-16 |
| 3 | Reuse or build new | `/wxHelpGenerate --video` replays each SCOPE-138 lesson's steps in UAT with Playwright video recording. A composition step uses HyperFrames to add captions, the oversized cursor, Kokoro narration, and brand tokens, producing an MP4. Each video records its lesson id and version. HeyGen, Pika, and Veo are **not used for the footage**, because generative video invents screens | Agreed | yes | 2026-10-16 |
| 4 | Release | One complete release, sequenced after SCOPE-138 (the lesson steps are the recording script) and therefore after SCOPE-137. The first `--video` run on wxKanban is the release test | Agreed | yes | 2026-10-16 |
| 5a | Recording environment | Recording **never** runs against Production. The generator refuses when the target address matches the Production list or is not on the UAT list (the same address lists and "unknown counts as Production" rule as SCOPE-138). UAT must hold demo data. Each video records the environment it was recorded in. Reason: video frames cannot be reliably scanned for personal data, so UAT-only recording is the actual protection | Agreed | yes | 2026-10-16 |
| 5b | Presenter | **Default:** narration only, in a neutral Kokoro voice. **Optional:** an animated brand mascot for the intro and outro, made in HyperFrames from the customer's brand art. **A real person's likeness only as "bring your own":** the customer supplies intro and outro clips they made themselves, and the generator records the customer's attestation that consent was obtained. wxKanban never creates a real person's likeness | Agreed | yes | 2026-10-16 |
| 5c | Pacing | Human-speed replay: hover before clicks, pauses, readable typing, and a hold on each new screen (defaults set per project). Click positions are recorded and the oversized animated cursor is added in composition, because Playwright video has no cursor (confirm on the first recording). Highlight or zoom on the element in use. Captions and narration come from the lesson's step text, and the footage is fitted to the narration. One video per process, a chapter per step, 1920×1080, and an end card naming the paired lesson. Any process over about 3 minutes is flagged for splitting | Agreed | yes | 2026-10-16 |
| 5d | Staleness | Same as the lessons: SCOPE-137 Change Impact flags the videos whose screens a change reaches. `--video --stale` re-records only those, keeping the paired lesson id and version in step | Agreed | yes | 2026-10-16 |
| 5e | Shipping and cost (was: bundle in the kit) | First chosen: bundle HyperFrames in the kit. Replaced by 5e-b | Agreed, then replaced | — | 2026-10-16 |
| 5e-b | Shipping and cost (replaces 5e) | **Install on first use.** `--video` installs a **pinned** HyperFrames version the first time it runs, keeping its Apache 2.0 notice. Preflight for Node 22+ and FFmpeg with clear "install this" messages. Rendering is local, at zero per-video cost; customers may optionally render on their own cloud account. No customer footage passes through wxKanban. The release checklist reviews the pinned version | Changed | yes | 2026-10-16 |
| 6 | Fit and priority | **Now**, as a **new scope**, after SCOPE-138. It is the video-generation scope SCOPE-065 deferred (065 gets a pointer to it). SCOPE-044 stays the player. It extends wxHelpGenerate, so help, lessons, and video come from one command | Agreed | yes | 2026-10-16 |
| D1 | Generative video for the walkthrough footage (Pika, Veo) | Declined: it invents screens and costs money per second | Declined | no | 2026-10-16 |
| D2 | wxKanban generating a real person's likeness | Declined: consent and biometric-data obligations belong to the customer | Declined | no | 2026-10-16 |
| D3 | Rendering customer videos on wxKanban servers | Declined: cost per customer, and footage would pass through our servers | Declined | no | 2026-10-16 |

## Risks to carry into the scope

- Video frames can't be scanned for personal data, so the UAT-only refusal is the one guard against
  real records appearing on video.
- The cursor gap in Playwright video is believed but not tested here. Confirm it on the first
  recording.
- The pinned HyperFrames version needs reviewing at each release. An upstream change must never
  reach customers untested.
- The likeness clips are the customer's responsibility. The attestation is recorded, but consent
  isn't verified by us.

## Questions for the customer reply

- An avatar of their own person would be their own HeyGen clip, used with that person's written
  consent and dropped into the generated videos.
- Marketing videos are a separate topic, deferred.

## Open items

None.

## Next step

**Done (SCOPE-139):** `/buildscope --from-md` built the new scope
`specs/Project-Scope/139-onboarding-videos.md` and its checklist. The draft passed the buildscope
gate (valid, 93). Every "yes" decision above was carried into the scope.

**Interview clarifications:**

- The term **Onboarding Video** was added to `CONTEXT.md`.
- Video covers web apps only; desktop and mobile video is reserved for a future scope.
- Demo data: customer apps require an attestation, re-asked whenever the UAT address changes.
  wxKanban's own videos use a seeded demo company.

**Not yet done:**

- A separate `/validateScope` run on the written file.
- `/createSpecs`.
- The pointer from SCOPE-065.
