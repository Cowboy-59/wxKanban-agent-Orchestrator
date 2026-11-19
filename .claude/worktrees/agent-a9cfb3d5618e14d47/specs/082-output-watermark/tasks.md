# SCOPE-082 — Generated-Output Watermark & Attribution — Tasks

Source of truth for code-fence task IDs (`[SCOPE 082 / Tnnn]`). Mirrors the
DB spec `082` created via `create_specs`. Task IDs use `###` headings so the
fence task-index (`buildTaskIdIndex`) resolves them.

## G1 — Shared watermark module (foundation)

### T001 — Zero-width codec
`shared/watermark/src/zero-width.ts`: encode/decode an invisible signature using zero-width characters (bit0/bit1 + sentinel), UTF-8 byte round-trip. Pure, deterministic. (FR-004)

### T002 — stampMarkdown + verifyMarkdown
`shared/watermark/src/stamp.ts`: frontmatter provenance block + visible attribution footer + embedded zero-width signature; idempotent (no double-stamp); plus verifyMarkdown recovering kind+version. (FR-001, FR-002, FR-003, FR-005)

### T003 — Workspace wiring
New `@wxkanban/watermark` package (package.json + tsconfig composite), referenced from root + mcp-server (file: dep + tsconfig reference), mirroring `@wxkanban/preflight`. (FR-001)

### T004 — Unit tests
`shared/watermark/tests/watermark.test.ts`: stamp→verify round-trip recovers version, absence on unstamped, idempotency, frontmatter-merge, footer presence. Success Criteria #3.

## G2 — Wire the TS generators

### T005 — MCP generators
Stamp output of `generateProjectLifecycleMarkdown` / `pushLifecycleToDb` and `generateDevplanMarkdown` / `regenerateDevplan` (mcp-server). Fail-open. (FR-006, FR-009)

### T006 — App generators
Stamp `ProjectLifecycleGenerator`, `DevelopmentPlanGenerator`, project-overview (`overview.ts`/`ProjectDocumentService`), and scope-analysis markdown. Fail-open. (FR-006, FR-009)

## G3 — PDF stamping

### T007 — PDF metadata + footer
`MarkdownPdfRenderer`: Puppeteer `displayHeaderFooter` + visible per-page footer; `pdf-lib` post-process to set Author/Producer/Subject/Keywords. Fail-open. (FR-008, FR-009)

## G4 — Conversion skills (Python)

### T008 — Python watermark helper
`wxkanban_watermark.py` with format parity to the TS module (frontmatter + footer + zero-width); wire the wxConversion writers. (FR-007)

### T009 — Wire cwConversion + vbConversion writers
The `write_if_new` helper + ER-diagram/scope/stub writers. (FR-007)

### T010 — Mirror sync
Keep `_wxAI/skills/<skill>`, `.claude/<skill>`, and `wxkanban-agent/templates/skills/<skill>` in sync; ensure the helper ships via kit-sync. (FR-007, FR-010)

## G5 — Verify utility, packaging, docs

### T011 — Verify/detect utility
A developer command/CLI that runs `verifyMarkdown` on a file and reports presence + encoded version. (FR-005)

### T012 — Python parity tests
Python tests for `wxkanban_watermark.py` (round-trip + absence). Success Criteria #3.

### T013 — Packaging
Version bumps + kit release wiring so the watermark module + Python helper travel to consumers. (FR-010)

### T014 — Docs
CLAUDE.md note on the watermark (what is stamped, that it is a funnel not a fence, the verify utility).
