---
description: wxRegenHelp — regenerate the end-user help (HTML site + PDF manual) in one of the 6 supported languages.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxRegenHelp — Regenerate End-User Help by Language

Rebuilds the wxKanban end-user help set — **both** the cross-linked **HTML help site** and the
single **PDF manual** — from the section content in `docs-workspace/`, capturing fresh screenshots
of the live app in the chosen language. Use it after UI changes, or to produce the guide in another
language.

`<language>` is one of the six languages from the app's language dropdown (friendly name or code):

| Choice | Locale | Output PDF | Output site |
|--------|--------|-----------|-------------|
| **English** (`en`) | `en-US` | `docs-workspace/wxKanban-User-Guide.pdf` | `docs-workspace/site/` |
| **Français / French** (`fr`) | `fr-FR` | `docs-workspace/i18n/fr-FR/wxKanban-User-Guide-fr-FR.pdf` | `docs-workspace/i18n/fr-FR/site/` |
| **Español / Spanish** (`es`) | `es-ES` | `…/i18n/es-ES/wxKanban-User-Guide-es-ES.pdf` | `…/i18n/es-ES/site/` |
| **Italiano / Italian** (`it`) | `it-IT` | `…/i18n/it-IT/…-it-IT.pdf` | `…/i18n/it-IT/site/` |
| **Deutsch / German** (`de`) | `de-DE` | `…/i18n/de-DE/…-de-DE.pdf` | `…/i18n/de-DE/site/` |
| **Português / Portuguese** (`pt`) | `pt-BR` | `…/i18n/pt-BR/…-pt-BR.pdf` | `…/i18n/pt-BR/site/` |

English is the canonical build in `docs-workspace/`; every other language builds into its own
`docs-workspace/i18n/<locale>/` so builds never clobber each other.

## Prerequisites

- **Dev servers running** — API on `http://localhost:3001`, client on **`http://localhost:5173`**
  (`npm run dev:server` and `npm run dev:client`). Start them first if they're not up.
- **Login credentials** for the account to capture, in the environment only (never written to disk):
  `WXK_EMAIL` and `WXK_PASS`.
- **Python 3 + Pillow** (screenshot crop/annotate) and **Puppeteer** (already a project dependency —
  drives Chrome for capture and renders the PDF).

## What to do when invoked

1. **Confirm servers are up** (start `dev:server` + `dev:client` if needed) and that `WXK_EMAIL` /
   `WXK_PASS` are set.
2. **For a non-English language, translate the prose first.** The mechanical step captures localized
   screenshots, but the section *text* must be translated for a real localized guide:
   - Seed the language workspace if missing: copy `docs-workspace/config.json` and
     `docs-workspace/sections/` into `docs-workspace/i18n/<locale>/` (the orchestrator does this
     automatically on first run).
   - **Translate** every `docs-workspace/i18n/<locale>/sections/*.md` into the target language,
     preserving Markdown structure, `![](img/…)` image paths, and `[text](other-section.md)`
     cross-links. Prefer the app's own locale terminology (from `src/client/i18n/locales/<locale>.ts`)
     so the guide matches the UI wording.
3. **Run the orchestrator:**
   ```bash
   WXK_EMAIL=… WXK_PASS=… node docs-workspace/tooling/regen.mjs <language>
   ```
   It maps the language to a locale, captures the app UI in that locale (seeding
   `localStorage.wxkanban_locale`), rebuilds the annotated + PII-redacted images, builds the HTML
   site, and renders the PDF. It **auto-cleans** raw screenshots and text dumps afterward so no
   unredacted on-screen data is left in the workspace.
4. **Verify** (the skill's step 7): every referenced image resolves, every internal cross-link
   resolves in both outputs, and no private data leaked (`grep` the built `site/` + PDF).

## Notes

- **Localization coverage:** only `en-US` is fully authored in the app today; other locales fall back
  to English per key (landing / common / settings are translated). So localized screenshots are
  partly English now and improve automatically as the app's translations grow — the biggest
  localization lever for the guide is translating the section prose (step 2).
- **Redaction is preserved** across languages: the Team member email and the Settings billing address
  are blacked out in the finals before they enter any site or PDF.
- This regenerates from existing sections. To author help for **new** screens, use `/wxHelpGenerate`
  first, then `/wxRegenHelp` to rebuild per language.

## Where it shows up

- Output lands in `docs-workspace/` (English) or `docs-workspace/i18n/<locale>/` (other languages):
  the self-contained help `site/` and the `wxKanban-User-Guide[-<locale>].pdf`.
- Pipeline: `docs-workspace/tooling/regen.mjs` → `capture.mjs` → `buildimages.mjs` →
  `.claude/skills/wxHelpGenerate/scripts/build_docs.py` → `topdf.mjs`.

## See also

- `/wxHelpGenerate` — author the help from scratch by walking the app screen by screen.
- `/help-catalog` — the subscription-aware in-app Help catalog (a different surface).
