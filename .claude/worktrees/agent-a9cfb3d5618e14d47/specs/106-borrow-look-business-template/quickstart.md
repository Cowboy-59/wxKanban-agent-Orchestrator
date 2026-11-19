# Quickstart: SPEC-106 — Borrow-a-Look Business Template

Developer walkthrough to build and verify the feature locally.

## Prerequisites

- SCOPE-062 machinery present (theme model, `projectthemes`/`companythemeprofiles`, Theme Studio, `deriveThemeViaAI`, `themePassesAA`).
- Local Postgres reachable via `src/db/client.ts`; `LLM_PROVIDER` configured (see `reference_llm_provider_contract`).
- Puppeteer/`@sparticuz/chromium` available (already used by `MarkdownPdfRenderer`).

## Build order

1. Apply the migration (Phase A): generate + apply `themetemplates` via the pg.Client transaction script (not drizzle-kit push).
2. Implement server seams (Phase B/C): capture service, `/derive/url`, execute extension, `themeTemplates` routes, `apply-template`.
3. Implement Studio UI (Phase D): From-a-website source, chrome editor, widened preview, TemplateGallery, Save-as-template.

## Manual verification

1. Start the app; open a web project → **Theme** tab → **From a website**.
2. Paste a URL (e.g. a public marketing site). Confirm the control gallery renders in a palette resembling the site, AA badges pass.
3. Add a logo (upload or company logo), set the app name and a footer line. Confirm the header/footer update live in the preview.
4. **Save as template** ("Acme House Style"). Open the **template gallery** — the entry appears.
5. Create a second web project → open the gallery → pick "Acme House Style". Confirm it inherits the tokens **and** the header/footer.
6. **Execute** and confirm `theme.css` + header/footer artifacts land beside the stack artifacts.
7. Failure check: paste an unreachable URL — confirm HTTP 2xx, a friendly message, an editable default theme, and that any chrome you entered is preserved.
8. Permission check: as a non-admin, confirm you can save a template but cannot rename/delete; as an admin, confirm rename/delete work.

## Done when

All 18 tasks complete, `tests.md` green, `wxkanban-agent auditfences` exits 0 for the new files.
