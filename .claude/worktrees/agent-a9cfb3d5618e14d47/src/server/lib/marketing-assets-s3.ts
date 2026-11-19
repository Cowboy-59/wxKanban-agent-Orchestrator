import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// [SCOPE 048 / T004] BEGIN — presigned-upload helper for the marketing-assets bucket
// Binary marketing assets are uploaded directly to S3 via an admin-issued, short-TTL
// presigned PUT — they never transit the API server. The public read URL is served
// from CloudFront (MARKETING_ASSETS_BASEURL). Config comes from env (App Runner).

const BUCKET = process.env.MARKETING_ASSETS_BUCKET;
const REGION = process.env.MARKETING_ASSETS_REGION ?? "us-east-1";
const BASEURL = process.env.MARKETING_ASSETS_BASEURL; // CloudFront domain, no trailing slash
const PREFIX = "public/"; // matches the bucket policy's public-read prefix
const UPLOAD_TTL_SECONDS = 300; // 5 min

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "application/pdf",
  "application/zip",
]);
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB ceiling (video MP4s)

export function marketingAssetsConfigured(): boolean {
  return Boolean(BUCKET && BASEURL);
}

/** Public CloudFront URL for a stored object key. */
export function publicUrlForKey(key: string): string {
  return `${BASEURL}/${key}`;
}

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Issue a short-TTL presigned PUT for a binary asset. Validates content-type and
 * size up front so the client can't request an unbounded/disallowed upload. The
 * key is namespaced under the public/ prefix with the asset id + sanitized name.
 */
export async function presignAssetUpload(opts: {
  assetId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignResult> {
  if (!marketingAssetsConfigured()) {
    throw new Error(
      "marketing assets bucket not configured (set MARKETING_ASSETS_BUCKET + MARKETING_ASSETS_BASEURL)",
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(opts.contentType)) {
    throw new Error(`content-type not allowed: ${opts.contentType}`);
  }
  if (!Number.isFinite(opts.contentLength) || opts.contentLength <= 0) {
    throw new Error("contentLength required");
  }
  if (opts.contentLength > MAX_BYTES) {
    throw new Error(`file exceeds ${MAX_BYTES} bytes`);
  }

  const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const key = `${PREFIX}${opts.assetId}/${safeName}`;

  const client = new S3Client({ region: REGION });
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_TTL_SECONDS,
  });

  return {
    uploadUrl,
    publicUrl: publicUrlForKey(key),
    key,
    expiresIn: UPLOAD_TTL_SECONDS,
  };
}
// [SCOPE 048 / T004] END

// [SCOPE 070 / T004] BEGIN — direct server-side put for Banner Studio (backgrounds + rendered PNGs)
// Banner backgrounds and composited PNGs are produced server-side (the bytes are already
// in hand), so they're written with a direct PutObject rather than the client presign
// flow. Render keys are versioned (render-<v>.png) so each re-render gets a new URL and
// CloudFront / <img> caches never serve a stale banner.
export function bannerObjectKey(bannerId: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${PREFIX}banners/${bannerId}/${safe}`;
}

export async function putBannerObject(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  if (!marketingAssetsConfigured()) {
    throw new Error(
      "marketing assets bucket not configured (set MARKETING_ASSETS_BUCKET + MARKETING_ASSETS_BASEURL)",
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(opts.contentType)) {
    throw new Error(`content-type not allowed: ${opts.contentType}`);
  }
  const client = new S3Client({ region: REGION });
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      // versioned keys → safe to cache hard
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrlForKey(opts.key);
}
// [SCOPE 070 / T004] END

// [SCOPE 070 / Amendment-E] BEGIN — presigned browser→S3 upload for a custom banner background
// A marketer can bring their own background image instead of an AI generation. Unlike the
// server-side generate/render puts above, the bytes originate in the browser, so we mirror
// the proven presignAssetUpload path (client PUTs straight to S3; bytes never transit the API).
// Restricted to still-image types with a tighter ceiling than the generic asset uploader.
const ALLOWED_BANNER_BG_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_BANNER_BG_BYTES = 15 * 1024 * 1024; // 15 MB — a background image, not a video

export async function presignBannerBackgroundUpload(opts: {
  bannerId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignResult> {
  if (!marketingAssetsConfigured()) {
    throw new Error(
      "marketing assets bucket not configured (set MARKETING_ASSETS_BUCKET + MARKETING_ASSETS_BASEURL)",
    );
  }
  if (!ALLOWED_BANNER_BG_TYPES.has(opts.contentType)) {
    throw new Error(`content-type not allowed: ${opts.contentType}`);
  }
  if (!Number.isFinite(opts.contentLength) || opts.contentLength <= 0) {
    throw new Error("contentLength required");
  }
  if (opts.contentLength > MAX_BANNER_BG_BYTES) {
    throw new Error(`file exceeds ${MAX_BANNER_BG_BYTES} bytes`);
  }

  // Versioned key (timestamp) → each upload is a distinct immutable object, so it can be
  // cached hard and listed alongside AI versions in bgversions without cache collisions.
  const key = bannerObjectKey(
    opts.bannerId,
    `upload-${Date.now().toString(36)}-${opts.filename}`,
  );

  const client = new S3Client({ region: REGION });
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_TTL_SECONDS,
  });

  return {
    uploadUrl,
    publicUrl: publicUrlForKey(key),
    key,
    expiresIn: UPLOAD_TTL_SECONDS,
  };
}
// [SCOPE 070 / Amendment-E] END

// [profile self-service] BEGIN — presigned browser→S3 upload for a user profile photo
// Mirrors the banner-background presign (bytes go browser→S3, never through the API,
// so they aren't bounded by the JSON body limit). Image-only, small ceiling. The
// stored URL is validated on save with isMarketingAssetUrl so a user can only persist
// a URL under our own CloudFront domain.
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB — a profile photo

/** True when a URL points at our managed assets domain (guards what avatarurl may be set to). */
export function isMarketingAssetUrl(url: string): boolean {
  return Boolean(BASEURL) && url.startsWith(`${BASEURL}/`);
}

export async function presignAvatarUpload(opts: {
  userId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignResult> {
  if (!marketingAssetsConfigured()) {
    throw new Error(
      "assets bucket not configured (set MARKETING_ASSETS_BUCKET + MARKETING_ASSETS_BASEURL)",
    );
  }
  if (!ALLOWED_AVATAR_TYPES.has(opts.contentType)) {
    throw new Error(`content-type not allowed: ${opts.contentType}`);
  }
  if (!Number.isFinite(opts.contentLength) || opts.contentLength <= 0) {
    throw new Error("contentLength required");
  }
  if (opts.contentLength > MAX_AVATAR_BYTES) {
    throw new Error(`image exceeds ${MAX_AVATAR_BYTES} bytes`);
  }

  const ext = opts.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  // Versioned key so <img>/CloudFront never serves a stale avatar after re-upload.
  const key = `${PREFIX}avatars/${opts.userId}/photo-${Date.now().toString(36)}.${ext}`;

  const client = new S3Client({ region: REGION });
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_TTL_SECONDS });

  return { uploadUrl, publicUrl: publicUrlForKey(key), key, expiresIn: UPLOAD_TTL_SECONDS };
}
// [profile self-service] END

// [SCOPE 100 / T008] BEGIN — presigned browser→S3 upload for the founder bio portrait
// Mirrors presignBannerBackgroundUpload: image-only, 15 MB, bytes go browser→S3 and never
// through the API. The stored URL is validated with isMarketingAssetUrl on save.
const ALLOWED_BIO_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BIO_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB — a portrait, not a video

export async function presignBioPhotoUpload(opts: {
  filename: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignResult> {
  if (!marketingAssetsConfigured()) {
    throw new Error(
      "assets bucket not configured (set MARKETING_ASSETS_BUCKET + MARKETING_ASSETS_BASEURL)",
    );
  }
  if (!ALLOWED_BIO_PHOTO_TYPES.has(opts.contentType)) {
    throw new Error(`content-type not allowed: ${opts.contentType}`);
  }
  if (!Number.isFinite(opts.contentLength) || opts.contentLength <= 0) {
    throw new Error("contentLength required");
  }
  if (opts.contentLength > MAX_BIO_PHOTO_BYTES) {
    throw new Error(`file exceeds ${MAX_BIO_PHOTO_BYTES} bytes`);
  }

  const safeName = opts.filename.replace(/[^A-Za-z0-9._-]/g, "-");
  // Versioned key so each upload is an immutable object and CloudFront can cache hard.
  const key = `${PREFIX}bio/photo-${Date.now().toString(36)}-${safeName}`;

  const client = new S3Client({ region: REGION });
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_TTL_SECONDS });

  return { uploadUrl, publicUrl: publicUrlForKey(key), key, expiresIn: UPLOAD_TTL_SECONDS };
}
// [SCOPE 100 / T008] END

// [SCOPE 108 / T009] BEGIN — presigned browser→S3 upload for Block Composer images.
// Replaces base64 data-URLs in the block JSON with a CloudFront URL; bytes go browser→S3.
const ALLOWED_BLOCK_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const MAX_BLOCK_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function presignBlockImageUpload(opts: {
  filename: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignResult> {
  if (!marketingAssetsConfigured()) {
    throw new Error(
      "assets bucket not configured (set MARKETING_ASSETS_BUCKET + MARKETING_ASSETS_BASEURL)",
    );
  }
  if (!ALLOWED_BLOCK_IMAGE_TYPES.has(opts.contentType)) {
    throw new Error(`content-type not allowed: ${opts.contentType}`);
  }
  if (!Number.isFinite(opts.contentLength) || opts.contentLength <= 0) {
    throw new Error("contentLength required");
  }
  if (opts.contentLength > MAX_BLOCK_IMAGE_BYTES) {
    throw new Error(`file exceeds ${MAX_BLOCK_IMAGE_BYTES} bytes`);
  }

  const safeName = opts.filename.replace(/[^A-Za-z0-9._-]/g, "-");
  const key = `${PREFIX}blocks/img-${Date.now().toString(36)}-${safeName}`;

  const client = new S3Client({ region: REGION });
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_TTL_SECONDS });

  return { uploadUrl, publicUrl: publicUrlForKey(key), key, expiresIn: UPLOAD_TTL_SECONDS };
}
// [SCOPE 108 / T009] END
