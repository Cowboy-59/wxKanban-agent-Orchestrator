# Component library gaps — WebDev controls with no shadcn/ui equivalent

shadcn/ui covers buttons, inputs, select/combobox, checkbox, radio, dialog (`POPUP_`), tabs/menu
(`MENU_`), card (`GR_` group box), and date pickers — the generator emits those directly. The
control categories below have **no native shadcn primitive** and need a third-party React library.
The generator flags each occurrence inline as `{/* GAP: … */}` and lists the recommendation.

Recommendations favor MIT/free libraries that sit on a React + Tailwind + shadcn/ui stack; paid
tiers are listed where they buy real capability. Verify versions/pricing at install time.

## Data grid — `TABLE_*`, `LOOP_*`
WebDev Tables/Loopers do sort, filter, inline edit, pagination, grouping; shadcn `Table` is static.
- **TanStack Table v8** (MIT) — headless (~15 KB), pairs with the official shadcn "data-table" recipe. **Default pick.**
- AG Grid Community (MIT) — batteries-included, ~90% of cases; AG Grid Enterprise (paid) adds pivot/tree/server-side.
- MUI X DataGrid Community (MIT); Pro $180/yr/dev, Premium $588/yr/dev.

## Rich-text / HTML editor — `RTA_*`, `HTM_*`
- **TipTap** (MIT core) — headless, ProseMirror-based, React 19; Pro/Cloud $49–999/mo for collab/comments. **Default pick.**
- Lexical (MIT, Meta); Quill (BSD); CKEditor / TinyMCE (free core + paid premium ~$75+/mo).
- **Email-specific** (newsletter builders): GrapesJS (BSD, drag-drop), Unlayer (freemium→paid), react-email (MIT, JSX templates).

## Charts — dashboard / stats controls
- **shadcn/ui Charts** (MIT, Recharts under the hood) — on-stack, themed to project tokens. **Default pick.**
- Recharts (MIT) directly; Tremor (Apache-2.0) for fast SaaS dashboards; Nivo (MIT) for variety.

## Captcha — `CPTCH_*`
- **Cloudflare Turnstile** (free, 1M req/mo) — privacy-first, usually no challenge UI, no EU consent banner. React: `@marsidev/react-turnstile`. **Default pick.**
- hCaptcha (free + publisher rewards); Google reCAPTCHA Enterprise (free ≤10k/mo then paid, needs GCP billing).

## File upload / CSV import
- **react-dropzone** (MIT) — headless drop zone; pair with **papaparse** for CSV. **Default pick.**
- FilePond (MIT) — full UI with previews/crop; Uppy (MIT) — resumable/TUS, remote sources.

## Image gallery / picker — `GAL_*`
- **Yet Another React Lightbox** (MIT) — keyboard/touch, zoom, fullscreen, captions. **Default pick.**
- react-photoswipe-gallery (MIT); react-image-grid-gallery (MIT). An image *manager* = Tailwind grid + lightbox + an upload library above.
