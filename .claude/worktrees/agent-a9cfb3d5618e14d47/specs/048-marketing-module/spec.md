# Spec 048: Marketing — In-App Marketing Module

**Spec Number**: 048
**Status**: `draft`
**Created**: 2026-06-08
**Parent Scope**: spec 045 (Marketing — umbrella; this is Spec 3 of the 5-spec split, **Phase 1, ideally before launch** but can trail the capture funnel)
**Depends On**: spec 046 (Lead Capture & Funnel — created the minimal `campaigns` table this spec extends, and the marketing DB/REST patterns reused here), spec 014 (SysAdmin / Platform Admin — the internal surface this module lives in)
**Blocks**: spec 047 (windev.wxperts.com integration — this spec provisions the public-read asset bucket that 047 serves assets from); informs spec 049 (wxperts.com migration) and spec 050 (outcomes & expansion)
**Source**: `specs/Project-Scope/045-marketing.md` (Section 9, Spec 3)

---

## Overview

The in-app **Marketing module** in the SysAdmin area: the system of record for **campaigns**, a **marketing asset library**, and a **posts board** that tracks what is going out where. It builds on the launch-critical funnel (spec 046) by giving the team a place to manage the content and channel activity around a campaign instead of loose markdown files and siloed S3 objects.

This spec **extends** the minimal `campaigns` table seeded in 046 into a fully-managed entity (full CRUD + SysAdmin editor), adds a new **`marketingassets`** table backed by a **new dedicated public-read S3 bucket** for binary assets (images, video MP4s, downloadables), and adds a new **`campaignposts`** table with a posts-board UI to track per-channel publishing status and live URLs. Assets are **locale-keyed** — language variants of one post/page share an `assetkey` and differ by `locale` (en-US authored first, structure ready for fr-FR/es/pt-BR/it/de). Binary uploads go **direct to S3 via admin-issued presigned PUT** (short TTL, constrained content-type/size) so MP4s never transit the API server; the client uploads, then PATCHes the `fileurl`. The existing hand-maintained markdown assets (`marketing/landing-page.md`, `marketing/launch-posts.md`, `marketing/feature-synopsis.md`, `marketing/kit-synopsis.md`) and the video MP4s already on S3 are migrated into managed records.

This module is Phase 1 and ideally lands before the July 5 launch so assets and campaigns aren't loose, but the funnel (046) works without it. Publishing stays **manual** — no social-media APIs.

## Business Problem

The launch will produce campaign activity — posts across WinDev forums, Facebook, X, LinkedIn, YouTube, the blog — plus a growing set of marketing assets (landing copy, synopses, videos, images). Today those live as developer-maintained markdown files and unconnected S3 objects with no link to the campaign or audience they serve, no record of what was published where, and no place for the internationalized variants the WinDev (French-heavy) and broader audiences need. This spec turns that into managed data the product owns: campaigns with goals and dates, an asset library with locale variants and a public delivery bucket, and a board that shows the team what is drafted, scheduled, and live per channel.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | wxperts platform admin — creates/manages campaigns, authors and uploads assets, tracks posts across channels from SysAdmin. |
| **Secondary Actors** | **wxKanban server** (serves campaign/asset/post records, issues presigned upload URLs, serves public asset metadata); **the new public-read S3 bucket + CloudFront** (delivers binary assets); the marketing sites (spec 047/049 consume the served assets — out of scope here). |
| **Key Value** | A single system of record for campaigns, locale-keyed assets, and channel/post activity — replacing loose markdown + siloed S3 objects, and provisioning the public asset bucket the sites serve from. |
| **Transport** | REST under `/api`, SysAdmin behind admin auth. Binary uploads go **direct to S3 via admin-issued presigned PUT** (the API returns the URL; the client uploads then PATCHes `fileurl`). **Not MCP** — internal admin surface, not a kit/consumer tool. |
| **Storage** | Campaign/asset/post **records in the app DB** (`db/client.ts`, postgres-js). **Binary public assets** (images, video MP4s, downloadables) in a **new dedicated public-read S3 bucket** — public-read only on the asset prefix, no public listing, separate from private/app storage; existing video MP4s migrate in. Writes only via admin-issued presigned PUT (short TTL, constrained content-type/size). |
| **i18n** | Assets are locale-keyed: language siblings share an `assetkey` and differ by `locale`, `(assetkey, locale)` unique. en-US authored first; structure ready for fr-FR/es/pt-BR/it/de. Internal SysAdmin UI is English-only. |
| **Scope Boundary** | **IN**: extend `campaigns` (goal, startdate, createdbyid, updatedat) + full CRUD API + SysAdmin campaign list/editor (A1); new `marketingassets` table + asset-library API + new public-read S3 bucket + admin presigned-PUT upload + asset-library UI with locale-variant switcher (A2); new `campaignposts` table + posts API + posts-board UI (A3); locale-keyed assets via `assetkey`+`locale` siblings (D1); migrate existing markdown assets + S3 video MP4s into `marketingassets`. **OUT (other 045 specs)**: lead capture/funnel (046); site wiring + serving (047 windev, 049 wxperts.com); analytics/stats A4 (050); Segment 2 broad audience (050); email-drip/automation; social auto-posting/scheduling; public WYSIWYG/CMS; machine translation. |

---

## Functional Requirements

**Campaign management (A1)**

- **FR-001** The system MUST **extend** the minimal `campaigns` table from spec 046 to add `goal`, `startdate`, `createdbyid`, and `updatedat` (any not already present), preserving the existing columns (`id`, `companyid`, `name`, `segment`, `launchdate`, `status`).
- **FR-002** The system MUST expose admin-authed campaign CRUD: `GET|POST /api/sysadmin/marketing/campaigns` and `GET|PATCH /api/sysadmin/marketing/campaigns/:id`. Deletion is soft via `status='archived'` (no hard delete in v1).
- **FR-003** A new SysAdmin **Campaigns** screen MUST present a campaign list and a detail/editor (all `campaigns` fields, plus the campaign's linked assets and posts), reachable from the SysAdmin Marketing area nav.

**Asset library (A2)**

- **FR-004** The system MUST provide a new `marketingassets` table (UUID v7 PK, `companyid`, `assetkey`, `locale`, `type` `post|page|video|synopsis|image|download`, `title`, `content` nullable, `fileurl` nullable, `targetsegment`, `campaignid?` FK, `status` `draft|scheduled|published`, `createdbyid`, `createdat`, `updatedat`) with a UNIQUE constraint on `(assetkey, locale)`.
- **FR-005** The system MUST expose admin-authed asset endpoints: `GET /api/sysadmin/marketing/assets` (filters `assetkey`/`locale`/`type`/`targetsegment`/`campaignid`/`status`), `POST …/assets`, and `GET|PATCH …/assets/:id`.
- **FR-006** The system MUST provision a **new dedicated public-read S3 bucket** for binary assets, **separate** from private/app storage: public-read **only on the asset prefix**, **no public listing**, with writes permitted **only via admin-issued presigned PUT**. Bucket name/region and CloudFront IDs MUST come from env vars (App Runner console convention), never committed.
- **FR-007** The system MUST expose `POST /api/sysadmin/marketing/assets/:id/upload-url` (admin-only) returning a **presigned PUT URL** with a **short TTL** and **constrained content-type and size**; the client uploads the binary **directly to S3**, then **PATCHes `fileurl`** on the asset (binaries never transit the API server).
- **FR-008** A new SysAdmin **Asset library** screen MUST present a **filterable grid** (by `type`, `targetsegment`, `campaignid`, `status`, `locale`), a **locale-variant switcher** that groups rows by `assetkey`, an **editor for text assets** (`content`), and a **presigned upload** flow for binary assets.
- **FR-009** The system MUST **migrate the existing hand-maintained markdown assets** (`marketing/landing-page.md`, `marketing/launch-posts.md`, `marketing/feature-synopsis.md`, `marketing/kit-synopsis.md`) into `marketingassets` records (en-US, appropriate `type`), and **migrate the existing video MP4s already on S3 into the new public-read bucket** with corresponding `marketingassets` records (`type='video'`, `fileurl` pointing at the new bucket via CloudFront).

**Channel / post tracking (A3)**

- **FR-010** The system MUST provide a new `campaignposts` table (UUID v7 PK, `companyid`, `campaignid` FK, `assetid?` FK → marketingassets, `channel` `facebook|x|linkedin|forum|youtube|blog`, `locale`, `status` `draft|scheduled|published`, `liveurl`, `publishedat`, `createdbyid`, `createdat`, `updatedat`).
- **FR-011** The system MUST expose admin-authed post endpoints: `GET /api/sysadmin/marketing/campaigns/:id/posts`, `POST …/posts`, and `GET|PATCH …/posts/:id`.
- **FR-012** A new SysAdmin **Posts board** screen MUST present columns by `status` (`draft → scheduled → published`); each card MUST show `channel` + `locale` + the `liveurl`. Publishing stays **manual** — no social-media API integration.

**Internationalization (D1)**

- **FR-013** Assets MUST be locale-keyed: every `marketingassets` row carries a `locale`, and language variants of the same asset share an `assetkey` (`(assetkey, locale)` unique). en-US is authored first; the structure MUST be ready for fr-FR/es/pt-BR/it/de variants without schema change.
- **FR-014** The asset library UI MUST let an admin view and switch between the locale variants of one `assetkey`, and create a new-locale variant from an existing en-US asset. Internal SysAdmin UI strings stay **English-only**.

**Data & conventions**

- **FR-015** All new/extended tables MUST follow DB conventions: plural lowercase, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table. Migrations are generated via drizzle-kit and applied via the `pg.Client` + transaction pattern (drizzle-kit push needs a TTY); the user applies the migration. Use `db/client.ts`, routes mount via `src/server/app.ts`.

---

## Entities

**`campaigns`** (extended from 046) — `id` (uuid v7 PK), `companyid` (FK), `name`, `goal` (new), `segment` (`windev`|`careerchanger`|`broad`), `startdate` (new), `launchdate`, `status` (`planned`|`active`|`completed`|`archived`), `createdbyid` (new), `createdat`, `updatedat` (new).

**`marketingassets`** (new) — `id` (uuid v7 PK), `companyid` (FK), `assetkey` (groups locale variants), `locale` (`en-US`, `fr-FR`, `es`, `pt-BR`, `it`, `de` …), `type` (`post`|`page`|`video`|`synopsis`|`image`|`download`), `title`, `content?` (text/markdown, nullable for binary types), `fileurl?` (public S3/CloudFront URL, nullable for text types), `targetsegment`, `campaignid?` (FK → campaigns), `status` (`draft`|`scheduled`|`published`), `createdbyid`, `createdat`, `updatedat`. **UNIQUE `(assetkey, locale)`**.

**`campaignposts`** (new) — `id` (uuid v7 PK), `companyid` (FK), `campaignid` (FK → campaigns), `assetid?` (FK → marketingassets), `channel` (`facebook`|`x`|`linkedin`|`forum`|`youtube`|`blog`), `locale`, `status` (`draft`|`scheduled`|`published`), `liveurl`, `publishedat`, `createdbyid`, `createdat`, `updatedat`.

Conventions: plural lowercase, no underscores/camelCase, UUID v7 PKs, FK = parent + `id`, `companyid` on every table.

---

## Success Metrics

1. An admin can create a campaign (name, goal, segment, start/launch date, status) and see it in the SysAdmin Campaigns list with its linked assets and posts.
2. An admin can author a text asset and upload a binary asset (image/MP4) via **presigned PUT** — the binary lands in the **new public-read bucket** without transiting the API server, and the asset's `fileurl` resolves publicly via CloudFront.
3. The asset library groups locale variants by `assetkey`; switching locale shows the correct variant, and a missing variant can be created from the en-US original.
4. The posts board shows draft/scheduled/published columns; each card shows channel + locale + live URL.
5. The existing markdown assets and S3 video MP4s appear as managed `marketingassets` records after migration; the MP4s serve from the new bucket.
6. The new bucket is public-read only on the asset prefix, has no public listing, and accepts writes only via short-TTL admin presigned PUT.

---

## Out of Scope (deferred to other 045 specs)

Lead capture / funnel (046); embedding the capture form and serving assets on the live sites (047 windev, 049 wxperts.com migration); analytics/stats A4 and per-channel/per-campaign outcome numbers (050); Segment 2 broad audience + non-EN translation **content** (050); email-drip / marketing automation; social-media auto-posting / scheduling APIs (publishing stays manual); public WYSIWYG/CMS content editing; machine translation.
