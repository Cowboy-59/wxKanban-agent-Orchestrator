# Implementation Plan: Marketing — In-App Marketing Module

**Spec**: 048 | **Parent Scope**: 045 (Marketing umbrella, Spec 3 of 5)
**Status**: `draft`
**Created**: 2026-06-08

---

## Approach

Build the SysAdmin marketing module on the existing main server, reusing the marketing DB/REST patterns established in spec 046 and the SysAdmin surface from spec 014. Build order: extend `campaigns` + add `marketingassets`/`campaignposts` schema → provision the new public-read S3 bucket → campaign CRUD API → asset API + presigned-upload endpoint → posts API → SysAdmin UI (campaigns, asset library, posts board) → migrate existing markdown + S3 video assets. The bucket and the presigned-upload path are the only new infrastructure; everything else is records on the app DB.

## Key Decisions

- **REST on the main server, not MCP.** Internal admin surface, not a kit/consumer tool. Mount routes via `src/server/app.ts` (prod entrypoint is `index.ts → app.ts`; `index2.ts` is dead — routes mounted there silently 404).
- **`db/client.ts` (postgres-js), never `lib/db.ts`.** The strict-TLS pg.Pool module breaks against RDS in prod.
- **Migration apply pattern:** generate via drizzle-kit, apply via `pg.Client` + transaction (drizzle-kit push needs a TTY; kit `dbpush` is broken). User applies the migration. The `campaigns` migration is **additive only** (new nullable columns) so it doesn't disturb the 046 funnel.
- **Presigned-PUT upload, not server-proxied.** Binary assets (MP4s, images, downloads) go direct to S3 via an admin-issued short-TTL presigned PUT with constrained content-type/size; the client uploads then PATCHes `fileurl`. Keeps MP4s entirely off the API server.
- **New dedicated public-read bucket, separate from app/private storage.** Public-read only on the asset prefix, no public listing. Bucket name/region + CloudFront IDs in env vars (App Runner console), never committed. AWS profile `Andy` for the infra.
- **Locale variants share `assetkey`.** `(assetkey, locale)` unique; en-US authored first; new-locale variants cloned from en-US in the UI. No machine translation.
- **Reuse SysAdmin patterns** (spec 014 / spec 043 queue-style screens) for the campaigns list, asset grid, and posts board. Internal UI English-only.

## Known Gates / Constraints

- **Bucket provisioning** (FR-006) is an infra task using AWS profile `Andy`; the bucket policy must be public-read on the asset prefix only, no public listing, separate from private/app storage. Secrets stay in env vars.
- **Migration of existing video MP4s** (FR-009) moves objects into the new bucket and points `fileurl` at the CloudFront distribution — verify URLs resolve publicly before flipping any site reference (sites are 047/049, out of scope here).
- **`campaigns` extension** must be additive and not break the 046 funnel's attribution path; new columns nullable / defaulted.
- **SysAdmin routing gap (carried from 043/046):** the mounted dashboard is the mock `pages/SysAdminDashboard.tsx`; wire the Marketing nav (Campaigns / Asset library / Posts board) into the mounted dashboard.
- **PII:** none new here (assets/campaigns/posts are marketing content, not lead PII — leads live in 046); admin-role access still applies.
- **Code fencing (spec 026):** all new top-level units fenced via the orchestrator `implement` path; run `auditfences` before push. (CLI dispatch is broken — use the direct-import wrapper / in-conversation implement; inline fences where the fence-emitter can't reach, per the 042/043/046 precedent.)

## Dependencies

- spec 046 (created the minimal `campaigns` table this extends + marketing DB/REST patterns), spec 014 (SysAdmin surface).
- **Blocks spec 047** (provides the public-read asset bucket windev serves from); informs spec 049 (wxperts.com) and spec 050 (outcomes).
- Existing **S3/CloudFront deploy pipeline** (`marketing/site/deploy/*`, redeploy.ps1) — a new public bucket is added alongside, not replacing it.

## Build Order

1. **T001** extend `campaigns` + add `marketingassets` + `campaignposts` schema + migration (apply).
2. **T002** provision the new public-read S3 bucket + CloudFront, env vars.
3. **T003** campaign CRUD API.
4. **T004** asset library API + presigned-upload endpoint.
5. **T005** posts API.
6. **T006** SysAdmin UI — campaigns list/editor.
7. **T007** SysAdmin UI — asset library (filterable grid + locale switcher + editor + presigned upload).
8. **T008** SysAdmin UI — posts board.
9. **T009** migrate existing markdown assets + S3 video MP4s into `marketingassets`.

## Verification

`npm run check-types` clean for new files; `auditfences` 0 violations on new declarations; quickstart scenarios in [quickstart.md](quickstart.md) pass against a local/live run; a presigned-PUT round-trip confirmed (upload → public CloudFront fetch); bucket policy verified (public-read on prefix only, no listing, writes only via presigned PUT); the existing markdown + video assets confirmed present as managed records after migration.
