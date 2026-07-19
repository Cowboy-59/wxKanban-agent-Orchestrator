# marketingassets mapping, segments, and scope exclusions

## Target segment vocabulary (`audience` → `targetsegment`)

The DB column `targetsegment` (varchar 20) takes exactly one of:

- **`windev`** — the beachhead: WINDEV / PCSoft / WEBDEV developers crossing to AI-built, owned stacks.
- **`careerchanger`** — developers ~1 year in who need software vocabulary + habits, not CS theory.
- **`broad`** — any developer/consultant, segment-agnostic.

Pick the *narrowest* segment the feature truly serves; use `broad` only when it genuinely spans all.

## Scopes to EXCLUDE (internal — not customer features)

These deliver developer/kit/ops value, not a buyer-facing capability. Skip them in step 1 unless a
customer-visible surface falls out of one:

- Kit/orchestrator mechanics: SCOPE-018/019 (CLI/MCP restructure, orchestrator kit), 080 (kit field
  defects), 083 (kit auto-update), 086 (app/kit/cockpit delivery), 095 (kit connect bootstrap).
- Token/context/numbering internals: SCOPE-089 (scope numbering), 093 (token efficiency), 087
  (overview-in-context), 048 (lifecycle consolidation, insofar as it's plumbing).
- Cockpit/dev-tooling internals: SCOPE-042/091/094 (dev cockpit, tree headers, startup health), 079
  (cockpit live help) — the *developer* Cockpit, not the end-user app.
- Fence/audit/analysis plumbing: SCOPE-026 (code fencing), 060/073/074/075/077 (scope analysis,
  flow-validation, capability index, portfolio analyzer, automated analysis) — internal quality tools.
- Infra/reconciliation: SCOPE-067/068/069/078/085/090 (subscription lifecycle/isolation/health,
  infra monitor, reconciliation, activation race).

Judgment call: some of these have a *thin* customer story (e.g. "your data is reconciled correctly").
Only promote one to a feature if a prospect would actually weigh it in a buying decision.

## Feature → marketingassets rows (the import script's mapping)

`marketingassets` columns (see `src/db/schema/marketingassets.ts`): `assetkey`, `locale`, `type`
(`post|page|video|synopsis|image|download`), `category` (`open|training|...`), `title`, `content`,
`fileurl`, `targetsegment`, `status`. Unique on `(assetkey, locale)`.

### 1. Feature definition → `synopsis`

| column | value |
|--------|-------|
| `assetkey` | `feature-<slug>` |
| `locale` | `en-US` (top-level fields) + one row per key in `locales` |
| `type` | `synopsis` |
| `category` | `open` |
| `title` | `name` (locale-overridden if present) |
| `content` | markdown: value prop, `**For:** <audience>`, `**Benefit:** <benefit>`, `_Source: <sourceRefs>_` |
| `targetsegment` | `audience` |
| `status` | `draft` |

### 2. Social seed → `post` (only if `social.seedDrafts` and `social.channels` non-empty)

| column | value |
|--------|-------|
| `assetkey` | `feature-<slug>-post` |
| `locale` | same locale set as the synopsis |
| `type` | `post` |
| `category` | `open` |
| `title` | `<name> — social` |
| `content` | a short seed: hook line from `valueProp`, the channel list, and a note to finish per-channel with SCOPE-065 Draft-with-AI. **Not** finished copy. |
| `fileurl` | the feature's **og** banner public URL: `https://<site>/banners/<slug>.og.<locale>.png` (valid after `redeploy.ps1`) |
| `targetsegment` | `audience` |
| `status` | `draft` |

One `post` row per feature (channel-agnostic seed listing the channels), not one per channel — keeps
the Assets library readable. SCOPE-065's Repurpose fans it out into per-channel copy on demand.

### Idempotency

Upsert `ON CONFLICT (assetkey, locale) DO UPDATE SET title, content, fileurl, targetsegment,
updatedat = now()`. Re-running after a JSON edit refreshes rows in place; a changed `slug` creates a
new asset (the old one is orphaned — clean up manually if needed).

### After import

Rows land in the sysadmin **Marketing hub → Assets / Posts** as drafts. There:
- **Translate** (SCOPE-065 FR-010) fills the 5 non-English locales for any row lacking them.
- **Draft-with-AI / Repurpose** turn the seed into finished per-channel copy.
- A human publishes/sends — nothing here auto-posts.
