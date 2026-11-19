# Test Plan: Marketing — In-App Marketing Module

**Spec**: 048 | **Created**: 2026-06-08
**Maps to**: spec.md functional requirements FR-001 … FR-015

---

## Unit / Integration (Vitest)

| ID | Covers | Test |
|----|--------|------|
| TT-01 | FR-001 | The `campaigns` extension adds `goal`/`startdate`/`createdbyid`/`updatedat` without disturbing existing 046 columns; an existing 046 lead still attributes to its campaign after migration. |
| TT-02 | FR-002 | Campaign CRUD: `POST` creates, `GET` lists + reads, `PATCH` updates; `status='archived'` soft-deletes (no hard delete); admin auth required (401/403 without). |
| TT-03 | FR-004, FR-013 | `marketingassets` inserts persist all fields; a second row with the same `(assetkey, locale)` is rejected by the unique constraint; a different `locale` for the same `assetkey` succeeds. |
| TT-04 | FR-005 | `GET /assets` honors `assetkey`/`locale`/`type`/`targetsegment`/`campaignid`/`status` filters; `POST`/`PATCH` mutate; admin auth required. |
| TT-05 | FR-007 | `POST /assets/:id/upload-url` returns a presigned PUT URL with a short TTL and constrained content-type/size; the URL targets the new public-read bucket; non-admins are rejected. |
| TT-06 | FR-007 | After a direct-to-S3 PUT, a `PATCH /assets/:id` sets `fileurl`; the binary never transits the API server (endpoint returns a URL, not a stream). |
| TT-07 | FR-010, FR-011 | `campaignposts` CRUD: create under a campaign, list via `GET /campaigns/:id/posts`, `PATCH` status draft→scheduled→published sets `liveurl`/`publishedat`; admin auth required. |
| TT-08 | FR-015 | All new/extended tables follow conventions (plural lowercase, no underscores/camelCase, UUID v7 PK, FK = parent + id, `companyid` present). |

## E2E (Playwright)

| ID | Covers | Scenario |
|----|--------|----------|
| E2E-01 | FR-003 | Admin opens SysAdmin → Marketing → Campaigns, creates a campaign (name/goal/segment/dates/status), sees it in the list with linked assets + posts on the detail view. |
| E2E-02 | FR-008, FR-014 | Admin opens the Asset library, filters the grid, authors a text asset, switches locale variants by `assetkey`, creates a fr-FR variant from the en-US original, and uploads a binary via the presigned flow (mock S3) setting `fileurl`. |
| E2E-03 | FR-012 | Admin opens the Posts board, creates a post (channel + locale), moves it draft → scheduled → published, sets the live URL — the card reflects channel + locale + live URL across columns. |

## Manual / Pre-launch verification

- **Presigned round-trip:** request an upload URL → PUT a real MP4/image direct to the new bucket → confirm it serves publicly via CloudFront → PATCH `fileurl` → asset resolves in the library.
- **Bucket policy:** verify public-read only on the asset prefix, **no public listing** (a bucket-list attempt is denied), writes only via presigned PUT, bucket separate from private/app storage.
- **Migration:** confirm the four markdown assets + the existing S3 video MP4s appear as managed `marketingassets` records; MP4s serve from the new bucket.
- **Secrets:** bucket name/region + CloudFront IDs read from env vars (App Runner console), nothing committed.

## Exit Criteria

All TT-* and E2E-* pass; `check-types` clean for new files; `auditfences` 0 violations; presigned round-trip + bucket-policy + migration manually confirmed.
