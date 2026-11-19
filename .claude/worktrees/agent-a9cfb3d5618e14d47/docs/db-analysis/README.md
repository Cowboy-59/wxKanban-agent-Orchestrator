# `docs/db-analysis/` — what lives here and what gets kept

Output from `npm run db:analyze` (wxDBAnalyze). Read-only analysis of the production database.

## Contents

| File | What it is |
|---|---|
| `FIX-LIST.md` | **Start here.** The prioritised plan — what to do, in what order, and what *not* to do |
| `latest.md` | The current canonical run, byte-identical to the timestamped copy below |
| `<timestamp>.md` | A retained run |
| `<timestamp>.snapshot.json` | Machine-readable summary for that run — declared/live tables, capabilities, counts |
| `latest.pdf` | Render of `latest.md`. **Not committed** — regenerate it (see below) |

## Retention rule

Keep:

1. **`latest.md`** and the timestamped run it was copied from.
2. **Any run cited by an artifact** — currently the 2026-08-02 run, referenced by
   `project-documentation/SOC2_EVIDENCE_PACK_2026-08-02.md`.
3. **The first run after a remediation**, so before/after is provable.

Delete everything else. Runs are cheap to regenerate and each is ~600 KB–900 KB; on 2026-08-02 this
directory had accumulated nine near-identical runs totalling 8.2 MB from a single day of iteration.

## Regenerating the PDF

The PDF is a render of `latest.md`, is ~3 MB, and is **not committed** — it is reproducible from
committed source, so it lives in `.gitignore`. To rebuild it:

```ts
// render.mts — run with: npx tsx render.mts, then delete
import { readFileSync, writeFileSync } from "node:fs";
import { MarkdownPdfRenderer } from "./src/server/services/MarkdownPdfRenderer.js";

const md = readFileSync("docs/db-analysis/latest.md", "utf8");
writeFileSync(
  "docs/db-analysis/latest.pdf",
  await MarkdownPdfRenderer.renderToPdf(md, "Database Analysis — wxKanban"),
);
```

Uses the project's own renderer (marked + puppeteer, wxKanban footer and PDF metadata), so the
output matches every other generated document.

## A caution about renders

`latest.pdf` was found on 2026-08-02 to be **3h47m older than `latest.md`** — generated from an
earlier run and never refreshed. Anyone opening the file named "latest" would have read a superseded
report believing it current. It has been renamed to make the mismatch visible.

**If you regenerate a PDF, regenerate it from the run it claims to represent, in the same step.** A
stale render under a current-sounding name is worse than no render.

## Reading a run

Each finding states severity and urgency **separately** (a low-severity item can be urgent), plus
evidence, business impact, remediation, fix risk, rollback, and the cost of doing nothing.

**Do not run remediation SQL straight out of the report.** On 2026-08-02 one finding marked
`critical` / `additive-safe` carried a statement that would have broken production, because the
foreign key it proposed was inferred from a column name and pointed at the wrong parent table. See
the top of `FIX-LIST.md`.
