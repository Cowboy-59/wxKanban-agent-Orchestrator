---
description: wxRefreshHelp — refresh BOTH help surfaces after a feature lands: author the gaps, recapture the English manual (site + PDF), and rebuild the in-app Help in all 6 languages. Run manually; it never runs itself.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxRefreshHelp — Refresh Both Help Surfaces

Run this **after a feature lands or an existing one changes**, when you decide the help has drifted.
It is deliberately manual — nothing triggers it automatically, because only you know whether a change
was user-visible enough to be worth re-photographing the app for.

wxKanban has **two** help surfaces built from **different sources**. Refreshing one leaves the other
stale, which is the failure this command exists to prevent:

| | In-app Help | User Guide (the manual) |
|---|---|---|
| Where users see it | `/help` inside the product | a downloadable site + PDF |
| Built from | `src/shared/help/` catalog + articles + guides, with per-locale JSON overlays | `docs-workspace/sections/*.md` + **live screenshots** |
| Built by | `scripts/build-help-html.mts` | `docs-workspace/tooling/regen.mjs` (`/wxRegenHelp`) |
| Output | `public/help.html` + `public/help.<xx>.html` | `docs-workspace/site/` + `wxKanban-User-Guide.pdf` |
| Languages | **all 6 in one run** | **one per run** — English is canonical |
| Goes stale when | help content is not authored for a new feature | the UI changes, so the screenshots no longer match |

## The rule this command enforces

**Completeness is not optional.** Every gap the coverage check finds is authored in **both**
surfaces and **all six languages** before anything is rendered. There is no "do the important ones",
no "ship the English and translate later", and no partial run that still reports success. Help that
covers four features out of five is worse than help that covers none, because the user who searches
for the fifth concludes it does not exist. If the full set is too large for one sitting, stop and say
so — do not render a subset.

**Both build commands are renderers, not authors.**

- `build-help-html.mts` re-renders whatever is in `src/shared/help/`. A feature absent from those
  sources is rendered in six languages and says nothing.
- `regen.mjs` re-photographs the app, but the prose comes from the 15 hand-written files in
  `docs-workspace/sections/`. A new screen with no section rebuilds beautifully and never mentions
  the feature.

Running only the renderers produces help that **looks freshly built and is quietly missing the
feature** — worse than obviously stale help, because nobody re-checks it. So this command refuses to
report success when only the mechanical steps ran.

## What to do when invoked

### 1. Establish what changed

**Read the staleness marker first** — `.wxai/help-stale.json`. `.husky/pre-push` writes it when a
push to `main` touched `src/client/pages/` or `src/client/components/` without touching either help
source. It names the commit range and the exact files, which is a far better starting point than
memory:

```bash
cat .wxai/help-stale.json 2>/dev/null || echo "no marker — nothing flagged since the last refresh"
```

If it exists, treat its `paths` as the work list. If it doesn't, ask the user which feature or scope
landed. Either way, find the user-visible surface: the route, the screen name, the controls added or
changed. A change with no user-visible surface (a migration, a refactor, an internal job) needs **no
help refresh at all** — say so, clear the marker, and stop rather than rebuilding for nothing.

### 2. Coverage check — the authoring gate

Before building anything, check whether the feature is actually represented in **both** sources:

```bash
# In-app help source
grep -ril "<feature term>" src/shared/help/catalog.ts src/shared/help/articles.ts src/shared/help/guides.ts
# Manual prose
grep -ril "<feature term>" docs-workspace/sections/
```

Report the result as a two-row table — covered / not covered — before proposing any build. Then:

- **Not in `src/shared/help/`** → author it there: a catalog entry, and an article with `overview`,
  `whatYouSee`, `controls`, `tasks`, `tips`. This is writing, not generation.
- **Not in `docs-workspace/sections/`** → for a genuinely new screen, run **`/wxHelpGenerate`** to
  author the section by walking the screen; for a changed screen, edit the existing section.
- **Covered in both** → the change is mechanical; go straight to the builds and say so.

### 3. Translate the new in-app strings

New English strings in `src/shared/help/` render as English in all six locales via per-string
fallback — the page will not break, it will simply be half-translated. Add the new keys to the five
overlays in `src/shared/help/i18n-data/<locale>.json` (`fr-FR`, `es-ES`, `it-IT`, `de-DE`, `pt-BR`),
matching the app's own terminology in `src/client/i18n/locales/<locale>.ts`.

**Every new string is translated before anything renders.** English fallback is a safety net for
strings that slip through, not a delivery strategy — a locale showing half English is a feature the
user cannot read. If the translation pass cannot be completed, stop before the builds rather than
shipping five half-translated locales.

### 4. Build the in-app Help — all 6 languages

```bash
npx tsx scripts/build-help-html.mts
```

No credentials, no servers. Writes `public/help.html` plus `help.{fr,es,it,de,pt}.html`.
Add `--locale fr-FR` to rebuild a single language.

### 5. Rebuild the English manual

Needs the dev servers up (`npm run dev:server`, `npm run dev:client`) and a login **in the
environment only**:

```bash
WXK_EMAIL=… WXK_PASS=… node docs-workspace/tooling/regen.mjs english
```

Never write credentials to a file, never echo them, and never ask for a password in conversation —
hand the user the command to run in their own terminal. See `/wxRegenHelp` for the full contract,
the other five languages, and the redaction guarantees.

### 6. Verify, then report honestly

- Every referenced image resolves in both outputs; every internal cross-link resolves.
- `grep` the built `site/` and `public/help*.html` for private data that should have been redacted.
- Confirm the new feature actually **appears** in both outputs — the point of the whole exercise.

End with a plain statement of what was authored, what was only re-rendered, and which locales are
still English. If a step was skipped, name it.

### 7. Clear the marker — only if it is honestly clear

```bash
rm -f .wxai/help-stale.json
```

Delete it **only** when **every** gap from step 2 appears in **both** outputs, in all six languages,
verified in step 6. Clearing it after a renderer-only or partial run converts a useful reminder into
a lie, and the next person will trust it. One unwritten feature means the marker stays and the run is
reported as incomplete — name what is outstanding.

## Usage

```bash
/wxRefreshHelp                          # reads the marker, then walks all seven steps
/wxRefreshHelp "SCOPE-111 test suite"   # names the feature up front
/wxRefreshHelp --no-capture             # prose changed but the UI did not; skip re-screenshotting
```

There is deliberately **no `--inapp-only` or `--manual-only`**. Those flags let one surface ship a
feature the other has never heard of, which is the drift this command exists to end. `--no-capture`
is different in kind: it skips re-photographing an unchanged UI, and omits no content.

## Boundaries

- **Manual only.** Nothing invokes this automatically. It is not wired into `implement`, by design —
  whether a change deserves a help refresh is a judgment call, not a build step.
- **Authors before it renders.** It will not report success on a renderer-only run.
- **All or nothing.** Every gap, both surfaces, six languages. Too big for one sitting is a reason to
  stop and say so, never a reason to render a subset.
- **Never handles credentials.** The manual rebuild is handed to the user as a command to run.

## See also

- `/wxRegenHelp` — the manual alone, in any one of the 6 languages.
- `/wxHelpGenerate` — author help for a brand-new screen by walking the app.
- `/help-catalog` — the subscription-aware in-app Help catalog; a different surface again.
