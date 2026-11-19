# Task Breakdown: Marketing — In-App Marketing Module

**Feature**: Marketing — In-App Marketing Module
**Spec**: 048
**Date Generated**: 2026-06-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Extend campaigns + add marketingassets + campaignposts schema + migration | high | done |
| 2 | T002 Provision new public-read S3 bucket + CloudFront | high | done (script; operator runs) |
| 3 | T003 Campaign CRUD API | high | done |
| 4 | T004 Asset library API + presigned-upload endpoint | high | done |
| 5 | T005 Campaign posts API | medium | done |
| 6 | T006 SysAdmin UI — Campaigns list/editor | high | done |
| 7 | T007 SysAdmin UI — Asset library (grid + locale switcher + upload) | high | done |
| 8 | T008 SysAdmin UI — Posts board + content calendar | medium | done |
| 9 | T009 Migrate existing markdown + S3 video assets into marketingassets | medium | done (markdown; video move = operator step) |

## Task Details

### T001 — Extend campaigns + add marketingassets + campaignposts schema + migration

**Extend** the `campaigns` Drizzle table from spec 046 with `goal`, `startdate`, `createdbyid`, and `updatedat` (additive, nullable/defaulted so the 046 funnel attribution is undisturbed — FR-001). Add the new `marketingassets` table (UUID v7 id; `companyid`; `assetkey`; `locale`; `type` post|page|video|synopsis|image|download; `title`; `content?`; `fileurl?`; `targetsegment`; `campaignid?` FK; `status` draft|scheduled|published; `createdbyid`; `createdat`/`updatedat`; **UNIQUE `(assetkey, locale)`** — FR-004, FR-013) and the new `campaignposts` table (UUID v7 id; `companyid`; `campaignid` FK; `assetid?` FK; `channel` facebook|x|linkedin|forum|youtube|blog; `locale`; `status` draft|scheduled|published; `liveurl`; `publishedat`; `createdbyid`; `createdat`/`updatedat` — FR-010). Generate the migration via drizzle-kit and apply via the pg.Client + transaction pattern (drizzle-kit push needs TTY). Follow DB naming conventions (plural lowercase, no underscores/camelCase, FK = parent + id, companyid on every table — FR-015). Use `db/client.ts`.

### T002 — Provision new public-read S3 bucket + CloudFront

Provision a **new dedicated public-read S3 bucket** for binary marketing assets, **separate** from private/app storage, using AWS profile `Andy` (FR-006): public-read **only on the asset prefix**, **no public listing**, writes permitted **only via presigned PUT**. Front it with CloudFront for delivery. Put the bucket name/region and CloudFront IDs in **env vars** (App Runner console convention) — never committed. Document the policy shape so the presigned-upload endpoint (T004) and migration (T009) can target it.

### T003 — Campaign CRUD API

Add admin-authed campaign routes under `/api/sysadmin/marketing`: `GET|POST /campaigns` and `GET|PATCH /campaigns/:id` (FR-002). Deletion is soft via `status='archived'` (no hard delete). Detail returns the campaign plus its linked assets and posts. Use `db/client.ts`; mount via app.ts.

### T004 — Asset library API + presigned-upload endpoint

Add admin-authed asset routes under `/api/sysadmin/marketing`: `GET /assets` with filters `assetkey`/`locale`/`type`/`targetsegment`/`campaignid`/`status` (FR-005); `POST /assets`; `GET|PATCH /assets/:id`. Add `POST /assets/:id/upload-url` returning an **admin-issued presigned PUT URL** with a **short TTL** and **constrained content-type/size** targeting the new public-read bucket (FR-007); the client uploads the binary **directly to S3** then **PATCHes `fileurl`** — binaries never transit the API server. Enforce the `(assetkey, locale)` uniqueness on insert. Use `db/client.ts`; mount via app.ts.

### T005 — Campaign posts API

Add admin-authed post routes under `/api/sysadmin/marketing`: `GET /campaigns/:id/posts`, `POST /posts`, `GET|PATCH /posts/:id` (FR-011). Status transitions across draft|scheduled|published; `liveurl` + `publishedat` set on publish. Publishing stays **manual** — no social-media API calls. Use `db/client.ts`; mount via app.ts.

### T006 — SysAdmin UI — Campaigns list/editor

Add a SysAdmin **Marketing** area with a **Campaigns** screen: list + detail/editor over all `campaigns` fields (name, goal, segment, start/launch date, status), showing the campaign's linked assets and posts (FR-003). Reuse SysAdmin patterns (spec 014/043). Wire a Marketing nav entry into the active SysAdmin dashboard (`pages/SysAdminDashboard.tsx` — the mounted mock dashboard, per the known routing gap). Internal UI English-only.

### T007 — SysAdmin UI — Asset library (grid + locale switcher + upload)

Add the **Asset library** screen: a **filterable grid** (type/targetsegment/campaign/status/locale), a **locale-variant switcher** grouping rows by `assetkey`, an **editor for text assets** (`content`), and a **presigned upload** flow for binary assets (request upload-url → PUT to S3 → PATCH `fileurl` — FR-008). Provide a "create new-locale variant from en-US" action (FR-014). Internal UI English-only.

### T008 — SysAdmin UI — Posts board + content calendar

Add the **Posts board** screen: columns by `status` (draft → scheduled → published); each card shows `channel` + `locale` + the `liveurl` (FR-012). **Content calendar (capability E, scope Amendment A):** posts carry a `scheduledat`; a calendar/timeline view groups scheduled posts by date so the pre-launch run-up can be planned across channels. Publishing stays **manual** — composing/scheduling in-app, a human posts to the channel and records the `liveurl`, status → published. Reuse SysAdmin patterns. Internal UI English-only.

### T009 — Migrate existing markdown + S3 video assets into marketingassets

Import the existing hand-maintained markdown assets (`marketing/landing-page.md`, `marketing/launch-posts.md`, `marketing/feature-synopsis.md`, `marketing/kit-synopsis.md`) into `marketingassets` records (en-US, appropriate `type` — page/post/synopsis), and **migrate the existing video MP4s already on S3 into the new public-read bucket** with `marketingassets` records (`type='video'`, `fileurl` pointing at the new bucket via CloudFront) (FR-009). One-off migration script; verify the MP4 URLs resolve publicly after the move.

---

## Sequencing

**T001 → T002** (schema + bucket) are the foundation. The APIs follow: **T003** (campaigns), **T004** (assets + presigned upload, depends on T002 bucket), **T005** (posts). UI lands after the APIs: **T006 → T007 → T008**. **T009** (migration) runs after T002 (bucket) + T004 (asset API) exist. This spec **blocks 047** by delivering the public-read bucket (T002) the windev site serves assets from.
