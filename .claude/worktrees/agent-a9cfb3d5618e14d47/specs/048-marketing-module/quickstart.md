# Quickstart: Marketing — In-App Marketing Module

**Spec**: 048 | **Created**: 2026-06-08

Integration scenarios that demonstrate the in-app marketing module end-to-end.

---

## Scenario 1 — Create and manage a campaign

1. As an admin, open SysAdmin → **Marketing** → **Campaigns** → create a campaign with `name`, `goal`, `segment="windev"`, `startdate`, `launchdate`, `status="planned"`.
2. **Expect:** the campaign appears in the list; its detail view shows the (extended) `campaigns` fields plus an empty linked-assets and linked-posts section; archiving it sets `status="archived"` (no hard delete).

## Scenario 2 — Author a text asset with locale variants

1. In the **Asset library**, create a text asset (`type="page"`, en-US, `assetkey="landing"`, `content` markdown, `targetsegment="windev"`, optional `campaignid`).
2. Use the locale-variant switcher to **create a fr-FR variant from the en-US original** (same `assetkey`, `locale="fr-FR"`).
3. **Expect:** both rows share `assetkey="landing"`; the grid groups them; a second en-US `landing` row is rejected by the `(assetkey, locale)` unique constraint.

## Scenario 3 — Upload a binary asset via presigned PUT

1. Create a `type="video"` asset, then `POST /api/sysadmin/marketing/assets/:id/upload-url`.
2. **Expect:** a presigned PUT URL with a short TTL + constrained content-type/size, targeting the **new public-read bucket**.
3. PUT the MP4 **directly to S3** (not through the API), then `PATCH /assets/:id` with the resulting `fileurl`.
4. **Expect:** the binary served publicly via CloudFront; the asset shows the `fileurl` in the library; the MP4 never transited the API server.

## Scenario 4 — Track posts on the board

1. Open the **Posts board** for a campaign; create a post (`channel="facebook"`, `locale="en-US"`, `status="draft"`, optional `assetid`).
2. Move it `draft → scheduled → published`, setting `liveurl` + `publishedat` on publish.
3. **Expect:** the card shows channel + locale + live URL and moves across the status columns; publishing is manual (no social API call).

## Scenario 5 — Migrate existing assets

1. Run the migration importing `marketing/landing-page.md`, `marketing/launch-posts.md`, `marketing/feature-synopsis.md`, `marketing/kit-synopsis.md` and moving the existing S3 video MP4s into the new bucket.
2. **Expect:** four en-US text-asset records (appropriate `type`) plus video records (`type="video"`, `fileurl` via the new bucket's CloudFront) appear in the library; the MP4s resolve publicly.

## Scenario 6 — Bucket policy guardrails

1. Attempt to **list** the new bucket publicly → denied (no public listing).
2. Attempt a public **write** without a presigned URL → denied.
3. Fetch an asset object by its public URL → succeeds (public-read on the asset prefix only).
4. **Expect:** bucket name/region + CloudFront IDs come from env vars; nothing committed.
