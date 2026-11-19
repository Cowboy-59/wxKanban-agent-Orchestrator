// [SCOPE 100 / T001] BEGIN — Founder bio asset identity
// The bio is locale-variant rows of ONE asset in marketingassets, keyed by assetkey.
// These values are load-bearing, not cosmetic:
//   - assetkey MUST NOT match 'feature-%' — scripts/translate-feature-snippets.ts:75
//     selects on that pattern and would enroll the bio in the wrong translation script.
//   - type MUST NOT be 'video' — GET /api/help/marketing-videos serves type='video'
//     rows with a non-empty fileurl, and the bio has a fileurl (the portrait).
//   - category 'bio' must also exist in the zod enum at marketingAdmin.ts:291 or every
//     admin PATCH 400s (see T003).
export const BIO_ASSETKEY = "founder-bio" as const;
export const BIO_TYPE = "page" as const;
export const BIO_CATEGORY = "bio" as const;
export const BIO_SOURCE_LOCALE = "en-US" as const;
// [SCOPE 100 / T001] END
