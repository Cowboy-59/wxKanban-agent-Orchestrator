# VB6 → React/shadcn conversion reference (gaps, mappings, migration notes)

Companion to `vbConversion`. Stage 2 (`vb6-form-to-react.py`) maps intrinsic VB6 controls directly
and flags everything else as a GAP. This file is the lookup for those gaps and the data migration.

## Intrinsic VB6 control → shadcn/Tailwind

| VB6 control | React / shadcn | Notes |
|---|---|---|
| `VB.Form` | page component / route | the screen shell; ignore twips layout, use a sensible grid |
| `VB.TextBox` | `<Input>` (or `<Textarea>` if `MultiLine = -1`) | `MaxLength`→maxLength; `PasswordChar`→type=password |
| `VB.Label` | `<Label>` / static text | VB6 labels are separate controls; field↔label pairing is by proximity, verify |
| `VB.CommandButton` | `<Button>` | `Caption` `&Save`→"Save" (accelerator dropped); `Default`→primary |
| `VB.CheckBox` | `<Checkbox>` | tri-state `Value=2` (grayed) → indeterminate |
| `VB.OptionButton` | `<RadioGroup>`/`<RadioGroupItem>` | group by container `Frame` |
| `VB.ComboBox` | `<Select>` | `Style=2`(dropdown list) vs editable combobox |
| `VB.ListBox` | list / `<Select multiple>` | `MultiSelect`→multiple |
| `VB.Frame` | `<Card>` / `<fieldset>` | also the radio-group boundary |
| `VB.Data` | **not a visual control** | a DAO record cursor → a data hook (TanStack Query) + a record-navigator (First/Prev/Next/Last/Add/Delete) |
| `VB.Timer` | `useEffect(() => { const id = setInterval(fn, Interval); return () => clearInterval(id); })` | `Enabled`→guard |
| `VB.Line` / `VB.Shape` | `<hr>` / border / decorative | usually drop; keep only if it conveys grouping |
| `VB.PictureBox` / `VB.Image` | `<img>` / a container | `.frx`-embedded images need extraction |
| `VB.Menu` | a menubar (shadcn `menubar`/`dropdown-menu`) | emitted as a note; wire into the app shell |

## Third-party OCX / ActiveX → React library (the GAPs)

These have no shadcn equivalent — pick deliberately:

| Legacy OCX | What it did | React replacement |
|---|---|---|
| MSFlexGrid / VSFlexGrid / TrueDBGrid / MSHFlexGrid | data grid | TanStack Table (+ shadcn table), AG Grid (heavy) |
| MSComctlLib `ListView` | report/detail list | TanStack Table, or a styled list |
| MSComctlLib `TreeView` | tree | react-arborist, or Radix-based tree |
| MSComctlLib `ProgressBar` / `Slider` / `StatusBar` | widgets | shadcn `Progress` / `Slider` / a footer bar |
| MSComctlLib `Toolbar` / `ImageList` | toolbar + icons | a flex toolbar + lucide-react icons |
| `ShockwaveFlash` (Flash.ocx) | Flash `.swf` | **dead tech** — drop, or replace with a video/Lottie/`<canvas>` |
| RichTextBox (`RICHTX32.OCX`) | rich text | Tiptap / Lexical |
| CrystalReport / `CRViewer` | reports | `@react-pdf/renderer` or a print-CSS route (see Stage 6) |
| Common Dialog (`COMDLG32.OCX`) | file/color/font dialogs | native `<input type=file>` / a color picker / OS dialogs |
| `MSWinsock` / `MSComm` | TCP / serial | a server-side service + REST/WebSocket (no browser equivalent) |
| Win32 `Declare` (user32/kernel32) | OS calls | **no web analog** — replace behavior or drop (see the procedures scope) |

## VB6 type → SQL / TS

VB6 form bindings carry **no column types** — the data scope infers from the field name and the
target dialect. When you have the `.mdb`, confirm types there. Rough map:

| VB6 / Access | SQL | TS |
|---|---|---|
| `String` / Text | VARCHAR | string |
| `String` (long) / Memo | TEXT | string |
| `Integer`/`Long` | INTEGER / BIGINT | number |
| `Single`/`Double`/`Currency` | REAL / DOUBLE / NUMERIC | number |
| `Date` | DATE / TIMESTAMP | string (ISO) / Date |
| `Boolean` / Yes-No | BOOLEAN | boolean |
| `Byte`/`Variant`/`Object` | — | verify case-by-case |

## Layout: twips

VB6 `Left/Top/Width/Height` are in **twips** (1440 per inch, 15 per pixel at 96 DPI). **Do not**
translate them — modernize to a responsive grid/flex layout. Twips are only useful for relative
ordering/sizing hints.

## Data: migrating out of Access (Jet)

The data is in an Access `.mdb`/`.accdb` (Jet) the target DB can't read directly:

1. **Export** each table to JSON/CSV — Access "Export", `mdb-tools` (`mdb-export`), or a small ADO/DAO
   dump script.
2. **Confirm the real schema against the `.mdb`** — the form binding gives column *names* only; types,
   lengths, the **primary key**, and relationships live in the database.
3. **Load** into the target DB using the Stage-3 DDL. Gotchas: Access column names with spaces were
   renamed (underscore, original in a comment); `Yes/No`→boolean; `AutoNumber`→identity; `Memo`→text;
   the form bound no key, so an `id` identity was synthesized — drop it if a real key (e.g.
   `ContactID`) exists.

## Data access pattern

VB6 here uses **DAO Data controls** with two-way bound fields and `Recordset.AddNew/Update/Delete` +
`MoveNext/MovePrevious` navigation. Rebuild as: a REST/data-layer API over the target DB, a typed
record model (Stage 3 `RecordShape`), and a record-navigator UI (or a grid for list views). Note any
**string-concatenated SQL** (`"select * from Contacts " & criteria`) — parameterize it; the original
is an SQL-injection risk.
