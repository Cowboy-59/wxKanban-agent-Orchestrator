# Spec 045: Marketing — In-App Module, Campaign Tracking, Lead Capture & Marketing Sites

**Spec Number**: 045
**Status**: `draft`
**Created**: 2026-06-08
**Last Reviewed**: 2026-06-08 (interactive buildscope — section-by-section, approved through Section 9). **Amendment A 2026-06-08** — expanded to add campaign/content calendar, outbound messaging (email + SMS), social auto-posting via platform APIs, multi-channel team alerts, and consent capture; several former Non-Goals brought in-scope. See "Amendment A" section below.
**Depends On**: spec 004 (LandingPage), spec 044 (landing-docs — the `wxkanban.wxperts.com/docs` video pages this scope links to), spec 014 (SysAdmin / Platform Admin — the internal surface this module lives in), spec 043 (User Feedback — reuses the SysAdmin queue UI pattern + DB-row-first / best-effort-notify resilience pattern), spec 008 (notification + email services, reused for new-lead alerts)
**Related Scopes**: ties to the WinDev→AI-dev conversion tooling (`wxConvert` / `wxKanbanConversion`) as the beachhead message. Existing hand-maintained assets (`marketing/landing-page.md`, `marketing/launch-posts.md`, `marketing/communities.md`, `marketing/site/*`) are the content this scope brings under management.
**Source**: `specs/Project-Scope/045-marketing.md`

---

## Overview

wxKanban gains a first-class **Marketing capability** spanning three connected layers: (1) an **in-app marketing module** in the SysAdmin area to manage campaigns, marketing assets (posts/pages/videos/synopses), and the signup→lead funnel; (2) **campaign tracking** that models channels and posts so the team sees what is going out where, when, and how it performed; and (3) two managed **marketing sites** — **windev.wxperts.com** (the WinDev→AI-dev wedge) and **wxperts.com** (broad/company brand) — whose content, lead capture, and analytics feed back into the in-app module instead of living in siloed S3 files.

The motion is built around a hard **July 5th 2026 launch** that creates a real funnel (signups → leads → onboarding) with no current system of record. Marketing today is loose markdown files plus two unconnected web properties; this scope turns it into data the product owns and can report on. The capability is **internationalized from the ground up** — every user-facing string and asset is locale-keyed (the WinDev community is heavily French, plus Spanish/Portuguese/Italian/German) even though the product is authored in en-US first.

## Business Problem

The July 5th launch will drive traffic to two sites, but there is no system of record for what that traffic becomes. Signups would land in disconnected forms, campaign activity lives in a developer's head and a markdown file, marketing assets are hand-edited files with no link to the campaigns or audiences they serve, and the two web properties don't share a capture or analytics model. As the audience widens beyond the WinDev beachhead, wxperts needs marketing to be **managed data inside the product** — campaigns, assets, audience segments, and a visible lead funnel — so the launch funnel is measurable end-to-end and future campaigns reuse the same machinery.

### Audience: wider than WinDev converts

The WinDev→AI-dev wedge is the sharp beachhead, but the scope explicitly supports a broader market via **audience segmentation**, so messaging and capture target each segment rather than one-size-fits-all. Phase 1 ships two segments with concrete, defensible messaging; the diffuse broad-market segment is Phase 2.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | wxperts platform admin — creates/manages campaigns, assets, and posts; works the lead funnel from SysAdmin. |
| **Secondary Actors** | **Site visitor / prospect** (submits the public signup/lead form on either site); **wxKanban server** (captures leads, derives segment, fires notifications, serves asset metadata); **existing pageview lambda** (analytics source); **notification + email services** (new-lead alerts). |
| **Key Value** | A single system of record for marketing — campaigns, assets, segments, and a SysAdmin-visible signup→lead funnel — making the July 5th launch funnel real and measurable, and replacing loose markdown + siloed S3 properties. |
| **Transport** | REST under `/api`. Public capture endpoint (`POST /api/marketing/leads`) unauthenticated + CORS-allowlisted + rate-limited; SysAdmin endpoints behind admin auth. **Not MCP** — this is public web traffic and internal admin, not a kit/consumer tool. |
| **Storage** | Asset/campaign/post/lead **records in the app DB** (`db/client.ts`, postgres-js). **Binary public assets** (images, video MP4s, downloadables) in a **new dedicated public-read S3 bucket** (videos already on S3 migrate in); writes only via admin-issued presigned PUT. |
| **Internationalization** | Every asset, site-content string, capture-form label, confirmation, and email template is **locale-keyed**; assets share an `assetkey` linking language siblings; fallback to `en-US` when a translation is missing. No machine-translation engine in v1 — translations are authored/supplied, stored, served. Internal SysAdmin UI is English-only in v1. |
| **Sites** | **windev.wxperts.com** — live on S3/CloudFront (known-good template). **wxperts.com** — currently hosted **elsewhere**; this scope **migrates it** onto the same S3/CloudFront/Route53 stack (verify-before-flip), then wires capture + asset-serving. |
| **Scope Boundary** | **IN**: in-app marketing module (campaigns, asset library + presigned upload, posts board); new public S3 bucket; public lead-capture endpoint + SysAdmin lead funnel + new-lead notifications; both sites integrated for capture + asset-serving; wxperts.com migration onto the AWS stack; locale-aware assets/capture/delivery (en-US authored, structure ready for translations); audience segmentation (Phase-1 segments). **OUT (future / Phase 2)**: marketing-automation / email-drip / sequences / A/B / CRM scoring; building our own analytics platform (reuse the pageview lambda); social-media auto-posting / scheduling APIs (publishing stays manual); public WYSIWYG/CMS content editing (site copy still deploys via the file-based pipeline in v1); paid-ads management; machine translation; Segment 2 (broad non-AI→AI); per-channel/per-campaign outcome stats (P2); segment many-to-many; consumer-company reuse (Layer 2). |

---

## Section 1 — Overview & Intent

(Captured in Overview / Business Problem above.) Three connected layers — in-app module, campaign tracking, and the two marketing sites — brought under product management, around the July 5th launch, internationalized from the start, serving an audience wider than WinDev converts while keeping WinDev as the sharp beachhead.

## Section 2 — Goals & Non-Goals

**Goals**

1. Single system of record for marketing: campaigns, assets, audience segments, and the signup→lead funnel — replacing loose markdown files and siloed S3 properties.
2. Capture and track signups/leads from both sites through to a SysAdmin-visible pipeline (new → contacted → qualified → onboarded/declined), with notifications on new leads.
3. Model campaigns and channels so the team sees what is scheduled, what is published, and basic outcome signals in one view.
4. Support audience segmentation (beachhead = WinDev→AI-dev; expansion = any non-AI→AI dev) so assets and capture can be targeted per segment.
5. Make the July 5th launch funnel real and measurable end-to-end before launch day.

**Non-Goals**

1. No full marketing-automation / email-drip engine (no sequences, A/B testing, CRM-grade scoring). Capture + notify + manual follow-up only in v1.
2. No analytics platform of our own — reuse the existing pageview lambda; surface its numbers, don't rebuild GA.
3. No social-media auto-posting / scheduling integrations (X/LinkedIn/FB APIs). Posts are authored and tracked in-app; publishing stays manual.
4. No public-facing CMS/WYSIWYG for non-technical editors in v1 — assets are managed by SysAdmin; site content still deploys via the existing pipeline.
5. No paid-ads management (spend, targeting, ad accounts).
6. No machine-translation engine — translations are authored/supplied, stored, served.

**Working assumptions**

- In-app module **and** the capture funnel both ship; the funnel is the higher-priority half because it's what the launch needs.
- **Both marketing sites are in scope**: windev.wxperts.com (WinDev wedge, launch-critical) and wxperts.com (broad/company brand) are both managed properties with content + capture + analytics feeding the in-app module.

## Section 3 — Target Audiences & Segments

**Segment 1 — WinDev / WebDev converts** *(Phase 1, beachhead)*
- **Who:** Seasoned PCSoft/WinDev developers, often solo or small-shop, livelihood tied to a proprietary platform now on forced-SaaS licensing.
- **Pain:** Existential platform/continuity risk — rent the source code, lose access if they stop paying. Already organized (Wx Alliance).
- **Message:** "You're not starting over, you're leveling up" + "the proof is the product" (wxKanban itself is the converted app).
- **Property:** windev.wxperts.com.
- **Channels:** WinDev-US FB, @WinDevUS, developpez.net, wxforum.info, Wx Alliance, blog.wxperts.com.

**Segment 3 — Career-changers & "vibe coders"** *(Phase 1)*
- **Who:** Two overlapping profiles — systems thinkers ~1 year in (the ex-mechanic profile), **and** "vibe coders" already building with AI but with no rigor: prompting their way to features, no spec, code and intent drifting apart.
- **Pain:** They can *generate* code fast but can't keep it coherent — no source of truth, specs (if any) rot, the AI and the codebase silently diverge, and they can't tell what's actually built vs. intended. Risk of becoming prompt-followers, not judgment-builders.
- **Message:** "Stop vibe coding — drive it from the spec." wxKanban pushes spec-driven development and **keeps specs and code provably in sync** (the lifecycle, fencing, and orchestrator are the mechanism). The lifecycle is the skill; the tools just changed.
- **Property:** wxperts.com (educational framing).
- **Channels:** content/SEO, YouTube how-to, broader dev/AI-coding communities (where vibe-coding pain is loudest).

**Segment 2 — Broad non-AI → AI converts** *(Phase 2)*
- **Who:** Any experienced dev on a non-AI workflow, any source platform.
- **Pain:** Falling behind the AI shift without a guided path.
- **Property:** wxperts.com. **Deferred to Phase 2** — diffuse; folds in once phase-1 capture/funnel is proven.

**Phasing:** Phase 1 = Segments 1 + 3 (both have concrete messaging and a home property). Phase 2 = Segment 2. Every captured lead is tagged with its segment (derived from source property + campaign) so the funnel slices per segment.

## Section 4 — Capabilities

**A. In-app marketing module (SysAdmin/marketing area)**
- A1. Campaign management — name, segment(s), goal, start/launch date, status. *(P1)*
- A2. Asset library — asset **records/metadata in the app DB**; **binary public files** (images, video MP4s, downloadables) in a **new dedicated public S3 bucket** (existing videos migrate in). *(P1)*
- A3. Channel/post tracking — per campaign, planned/published posts across channels (FB, X, LinkedIn, forums) with status (draft → scheduled → published) + live URL. Publishing stays manual. *(P1)*
- A4. Outcome signals — basic per-channel/per-campaign numbers (signups attributed + pageviews from the existing lambda). *(P2)*

**B. Lead / signup capture & funnel**
- B1. Public capture endpoint both sites post to (segment derived from source property + campaign). *(P1)*
- B2. Lead pipeline — SysAdmin view, status new → contacted → qualified → onboarded/declined, segment filter, notes. *(P1)*
- B3. New-lead notifications — in-app + email (reuse existing notification/email services). *(P1)*

**C. Marketing sites**
- C1. windev.wxperts.com — content + capture (→B1) + analytics (→A4); serves public assets from the new bucket via CloudFront. *(P1)*
- C2. wxperts.com — **migrate hosting/DNS** from its current host to S3 + CloudFront + Route53 (mirroring windev), **then** add capture + asset-serving + analytics. DNS-cutover risk → verify-before-flip, isolated task. *(P1)*

**D. Internationalization (i18n)** *(cross-cutting)*
- D1. Locale-aware assets — every asset and site-copy string carries a `locale`; assets group by a shared `assetkey` so all language variants of one post/page are linked. *(P1: en-US authored + structure ready for translations)*
- D2. Locale-aware capture — captured leads record `locale` so follow-up/messaging match their language. *(P1)*
- D3. Translatable site delivery — both sites serve the correct language variant; fall back to en-US when a translation is missing. *(P1 structure; non-EN translations land as content, phaseable per language wave)*
- D4. No machine-translation engine in v1 — translations authored/supplied, stored, served.
- **Design rule:** any user-facing string (asset copy, site content, form labels, confirmations, email templates) must be locale-keyed, never hardcoded English. Internal SysAdmin UI stays English-only in v1.

**Site-content editing (v1, KISS):** site *content* (HTML/copy) continues to deploy via the existing S3/CloudFront file-based flow — only **capture + analytics + public-asset serving** integrate with the app. In-app WYSIWYG content editing is deferred (Non-Goal).

## Section 5 — Data Model

Conventions: plural lowercase tables, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table for tenancy.

**`campaigns`** — `id`, `companyid`, `name`, `goal`, `segment` (`windev` | `careerchanger` | `broad`), `startdate`, `launchdate`, `status` (`planned` | `active` | `completed` | `archived`), `createdbyid`, `createdat`, `updatedat`

**`marketingassets`** — `id`, `companyid`, `assetkey` (groups locale variants), `locale` (`en-US`, `fr-FR`, `es`, `pt-BR`, `it`, `de` …), `type` (`post` | `page` | `video` | `synopsis` | `image` | `download`), `title`, `content` (text/markdown, nullable for binary types), `fileurl` (public S3 URL, nullable for text types), `targetsegment`, `campaignid` (FK → campaigns, nullable), `status` (`draft` | `scheduled` | `published`), `createdbyid`, `createdat`, `updatedat`. `(assetkey, locale)` unique.

**`campaignposts`** — `id`, `companyid`, `campaignid` (FK), `assetid` (FK → marketingassets, nullable), `channel` (`facebook` | `x` | `linkedin` | `forum` | `youtube` | `blog`), `locale`, `status` (`draft` | `scheduled` | `published`), `liveurl`, `publishedat`, `createdbyid`, `createdat`, `updatedat`

**`marketingleads`** — `id`, `companyid`, `email`, `name` (nullable), `sourceproperty` (`windev` | `wxperts`), `campaignid` (FK, nullable), `segment`, `locale`, `status` (`new` | `contacted` | `qualified` | `onboarded` | `declined`), `declinedreason` (nullable), `notes` (nullable), plus optional qualifying fields (company, platform-converting-from), `createdat`, `updatedat`. Insert fires the new-lead notification (B3).

**Decisions:**
- **Segment is a constrained text field, not a table** (3 phase-fixed values) — KISS. One *primary* segment per asset/campaign in v1; add an `assetsegments` join table later only if true many-to-many is needed.
- **Analytics (A4): no new table in v1** — read from the existing pageview lambda; attribute signups via `campaignid`/`sourceproperty` on `marketingleads`.
- **Tenancy:** `companyid` everywhere even though v1 is wxperts' own marketing — keeps consumer-company reuse open without reshaping schema.
- **i18n:** `locale` on assets, posts, and leads; `assetkey` links language siblings; en-US authored first.

## Section 6 — API Surface

REST under `/api`, `db/client.ts`, SysAdmin behind admin auth, public capture unauthenticated + rate-limited.

**Public:** `POST /api/marketing/leads` — body `email`, `name?`, `sourceproperty`, `campaign?`, `locale`, optional qualifying fields; server derives `segment`. CORS-allowlisted to the two site origins, rate-limited, honeypot/basic anti-spam. Fires notification on success.

**SysAdmin — Campaigns:** `GET|POST /api/sysadmin/marketing/campaigns` · `GET|PATCH …/campaigns/:id`

**SysAdmin — Assets:** `GET …/assets` (filter `assetkey`/`locale`/`campaignid`/`segment`/`status`) · `POST …/assets` · `GET|PATCH …/assets/:id` · `POST …/assets/:id/upload-url` (admin-only **presigned PUT** to the public bucket, short TTL, constrained content-type/size; client uploads binary direct, then PATCHes `fileurl`).

**SysAdmin — Posts:** `GET …/campaigns/:id/posts` · `POST …/posts` · `GET|PATCH …/posts/:id`

**SysAdmin — Leads:** `GET …/leads` (filter `segment`/`status`/`sourceproperty`/`campaignid`) · `GET …/leads/:id` · `PATCH …/leads/:id/status` (`declined` requires `declinedreason`) · `POST …/leads/:id/note`

**SysAdmin — Outcomes** *(P2)*: `GET …/stats` — per-campaign/-channel signups (from `marketingleads`) + pageviews (existing lambda).

All public-facing response strings (confirmation, errors) are locale-keyed.

## Section 7 — UI / Screens

New SysAdmin "Marketing" area (nav entry in the active SysAdmin dashboard); internal UI English-only v1, public UI locale-aware.

- **Marketing home** — entry hub: active campaigns, recent leads, quick counts (leads by status/segment).
- **Campaigns** — list → detail/editor (fields from `campaigns`, linked assets + posts).
- **Asset library** — filterable grid (type, segment, campaign, status, **locale**); rows group by `assetkey` with a **locale-variant switcher**; editor for text assets, presigned upload for binaries.
- **Posts board** — per campaign, columns by status, each card = channel + locale + live URL.
- **Leads pipeline** — table with segment/status/source filters; detail drawer; status transitions (decline requires reason); notes thread. **Reuses the spec 043 SysAdmin feedback-queue UI pattern.**
- **Stats** *(P2)* — per-campaign/-channel signups + pageviews.
- **Public capture form** — shared by both sites: email + optional name + optional qualifying fields; all labels/placeholders/confirmation locale-keyed; submits to `POST /api/marketing/leads` with `sourceproperty` + `locale`. Inline localized thank-you state.

## Section 8 — Non-Functional, Security & Dependencies

**Security**
- **CORS allowlist** — capture endpoint accepts only the two site origins; no wildcard.
- **Rate-limiting + anti-spam** — per-IP limit + honeypot; reject bots without blocking real signups.
- **Public bucket policy** — public-read only for the asset prefix; writes only via admin-issued presigned PUT; no public listing; separate bucket from private/app storage.
- **Presigned-upload auth** — admin-only, short-TTL URL, constrained content-type/size.
- **PII** — `marketingleads` holds email/name/company; treated as PII (existing encryption-at-rest posture), admin-role access only.
- **Secrets** — bucket name/region, CloudFront IDs, keys in env vars (App Runner console convention), never committed.

**Non-functional**
- Capture endpoint p95 < 500ms; lead row written before notification (notification best-effort, never blocks — spec 043 pattern).
- Locale fallback to en-US must never 404 a page/asset.
- Asset uploads via presigned URL keep MP4s off the API server entirely.

**Dependencies**
- Existing **S3/CloudFront deploy pipeline** (`marketing/site/deploy/*`, redeploy.ps1) — extended, not replaced; new public bucket added.
- Existing **pageview lambda** — read for A4 stats (P2).
- Existing **notification + email services** — reused for B3.
- **AWS profile `Andy`** for marketing infra (per convention; not default).
- **wxperts.com** is hosted **elsewhere** → **migration onto the AWS stack is in-scope**; needs current DNS/registrar + content inventory before a low-risk cutover (stand up on CloudFront, verify, then flip DNS).

## Section 9 — Phasing & Suggested Spec Split

Too large for one spec. Suggested split (each becomes its own `specs/###-Name/` via createspecs):

**Launch-critical (live by July 5):**
- **Spec 1 — Lead Capture & Funnel.** `marketingleads` schema, public `POST /api/marketing/leads` (CORS, rate-limit, anti-spam, locale), SysAdmin leads pipeline (B2), new-lead notifications (B3), minimal `campaigns` row for attribution. *Highest priority — the funnel the launch needs.*
- **Spec 2 — windev.wxperts.com Integration (C1).** Wire the live site's capture form to Spec 1, serve assets from the new public bucket, locale-aware confirmation.

**Phase 1, ideally before launch (can trail slightly):**
- **Spec 3 — In-App Marketing Module.** `campaigns` / `marketingassets` / `campaignposts`, asset library + presigned upload, new public S3 bucket, posts board, campaign management (A1–A3, D1). Migrates existing markdown/video assets in.
- **Spec 4 — wxperts.com Migration + Integration (C2).** Migrate hosting/DNS to S3/CloudFront (verify-before-flip, isolated), then capture + asset-serving. Carries DNS-cutover risk → own spec, own verification gate.

**Phase 2 (after launch):**
- **Spec 5 — Outcomes & Expansion.** Stats/analytics (A4), Segment 2 (broad non-AI→AI), additional locale translations (fr-FR, es, pt-BR, it, de content rows), segment many-to-many if data warrants.

**Critical path to July 5 (today 2026-06-08, ~4 weeks):** Spec 1 → Spec 2 complete and verify first. Spec 3 ideally lands so assets/campaigns aren't loose, but the funnel works without it. Spec 4 (wxperts.com migration) is riskiest and is **not** launch-blocking for windev — schedule deliberately, not under launch pressure.

---

## Success Metrics

1. A visitor on either site can submit the signup/lead form and receives a localized confirmation **within 3 seconds**; the lead is persisted to `marketingleads` with the correct `segment`, `sourceproperty`, and `locale`.
2. **Zero silent drops:** 100% of accepted submissions are persisted; any notification leg that fails is best-effort and never blocks or loses the lead (spec 043 resilience pattern).
3. wxperts admins can work any lead through the funnel (status change, note, decline-with-reason) from SysAdmin, sliced by segment/source/campaign.
4. Every marketing asset and site-copy string is locale-keyed; a missing translation falls back to en-US and never 404s.
5. The July 5th launch funnel is measurable end-to-end: signups attributable to campaign + channel + segment, pageviews surfaced from the existing lambda (A4, P2).
6. Both sites serve public binary assets (including the video MP4s) from the new dedicated public-read bucket via CloudFront; wxperts.com is migrated onto the AWS stack with a verified cutover.

---

## Amendment A (2026-06-08) — Planning, Outbound Channels, Social Auto-posting, Consent

After reviewing the live 046 leads funnel, the scope is expanded to add marketing **planning** and **outbound** capability. This amendment **brings several original Non-Goals in-scope** (email automation, SMS, social auto-posting) and adds a consent cross-cut. None of it blocks the July 5 launch.

### Pre-release vs post-launch (the key reframing)

"Pre-release marketing" = what's usable **before** July 5 to run the launch-up campaign. The outbound *sending* channels are **inherently post-launch** — they need (a) a consented audience list, which only exists once capture is live, and (b) external approvals with multi-week lead times. So:

- **PRE-RELEASE (buildable now, no external deps):**
  - **048 In-App Marketing Module** + **content calendar/scheduling** — plan campaigns, manage assets (import `launch-posts.md` + `communities.md`), and a **posts board for MANUAL community posting** (compose, schedule, mark published, store live URL). This is the real pre-release marketing surface.
  - **047 windev capture live** — so pre-release posts build the consented list.
- **POST-LAUNCH (need list + external approvals):** 051 outbound email/SMS, 052 social auto-posting, 053 multi-channel team alerts.

### New / expanded capabilities

- **E. Campaign + content calendar** *(expands 048, PRE-RELEASE)* — schedule `campaignposts` on a calendar/board; status draft→scheduled→published; manual publish (human posts to the channel, records the live URL). No platform APIs.
- **F. Outbound email** *(new spec 051, post-launch)* — compose/send email campaigns to consented leads; templates (locale-keyed), send log, **CAN-SPAM compliance: unsubscribe + physical address + opt-out honored**. No drip/sequences/A-B in v1 (single sends/broadcasts).
- **G. Outbound SMS** *(new spec 051 phase 2, post-launch)* — SMS to **opted-in** leads via a provider (Twilio). **Hard external dependency: A2P 10DLC brand + campaign registration** (carrier approval). **TCPA: explicit prior consent required**, opt-out (STOP) honored.
- **H. Social auto-posting** *(new spec 052, post-launch)* — publish `campaignposts` to FB/X/LinkedIn via platform APIs + OAuth. **Per-platform external approval** (Meta app review, X paid API tier, LinkedIn marketing-developer/partner access) — long lead times; build per-platform, sequential, behind an approval/review step.
- **I. Multi-channel team alerts** *(new spec 053, post-launch)* — new-lead/event alerts to the wxperts team over email/SMS/in-app (extends 046's notify; 043 earmarked SMS + AI-assistant as v2 channels). Reuses the Twilio setup from 051.
- **J. Consent capture** *(cross-cut, PRE-RELEASE — fold into 046 storage + 047 form)* — capture form gains optional **`phone`** + **`smsconsent`** + **`emailconsent`**. Required so the launch list is **outreach-legal** for SMS/email later. Adds columns to `marketingleads` (migration 0029) + endpoint accepts them + 047 form collects them with clear consent language.

### Non-Goals (revised)

Still out, even after this amendment: email **drip sequences / automation workflows / A-B testing / CRM-grade lead scoring**; building our own analytics platform; **paid-ads** management; **machine translation**. (Email/SMS *broadcasts* and social *auto-posting* are now IN; the automation/sequencing layer on top of them is not.)

### External dependencies & compliance (start paperwork in parallel — independent of code)

- **Twilio A2P 10DLC** brand + campaign registration (SMS) — ~1–3 weeks carrier review.
- **Meta app review** (FB/Instagram publishing), **X API** paid tier, **LinkedIn** marketing-developer/partner access (social) — weeks each, sequential per platform.
- **CAN-SPAM** (email): unsubscribe link, honored opt-outs, valid physical mailing address.
- **TCPA** (SMS): documented prior express consent (the `smsconsent` field), STOP/opt-out handling.

### Revised spec map

| Spec | Title | Phase | Notes |
|---|---|---|---|
| 046 | Lead Capture & Funnel | done | + consent columns via amendment J (migration 0029) |
| 047 | windev Integration | pre-release | + capture-form consent fields (phone/SMS/email) |
| 048 | In-App Marketing Module | **pre-release priority** | + content calendar/scheduling (capability E) |
| 049 | wxperts.com Migration | post-launch | unchanged |
| 050 | Outcomes & Expansion | phase 2 | unchanged |
| 051 | Outbound Messaging (email + SMS) | post-launch | capability F + G; email phase 1, SMS phase 2 |
| 052 | Social Publishing | post-launch | capability H; per-platform, approval-gated |
| 053 | Multi-channel Team Alerts | post-launch | capability I; reuses 051 Twilio |
