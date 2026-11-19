# Clarion → React/shadcn reference (control map, pictures, types, library gaps)

This is the lookup table the `clarion-window-to-react.py` and `clarion-dict-to-sql.py` scripts encode,
plus the third-party libraries to reach for when no shadcn primitive fits. Verify versions/pricing at
install time.

## Clarion control → shadcn/ui

The generator emits these directly:

| Clarion control | shadcn / React target | Notes |
|---|---|---|
| `WINDOW` | page shell (`<div>` app-shell) | caption → page `<h2>` |
| `SHEET` / `TAB` | `Tabs` / sections | each `TAB('cap')` → a section + heading |
| `PROMPT` | `Label` | the static field label |
| `ENTRY(@pic)` | `Input` | picture → placeholder/format hint (see below) |
| `TEXT` | `Textarea` | multi-line edit |
| `BUTTON` | `Button` | gets an `on<Use>()` handler stub |
| `STRING` | `<span>` | static literal text |
| `CHECK` | `Checkbox` + `Label` | boolean USE field |
| `OPTION` + `RADIO` | `RadioGroup` + `RadioGroupItem` | OPTION is the group |
| `SPIN` | `Input type=number` | numeric stepper |
| `GROUP` | `<fieldset>` / `Card` | visual grouping |
| `MENUBAR`/`MENU`/`ITEM` | `Menubar` / `DropdownMenu` | app menu |
| `POPUP` | `DropdownMenu` / context menu | right-click menus |

These have **no native shadcn primitive** — flagged inline `{/* GAP: … */}`:

| Clarion control | Why it's a gap | Recommended library |
|---|---|---|
| `LIST` (browse, `FROM(queue)`) | shadcn `Table` is static; Clarion browses sort/filter/page/scroll a VIEW | **TanStack Table v8** (MIT, + shadcn data-table recipe). Alt: AG Grid Community, MUI X DataGrid. |
| `COMBO` / `DROPCOMBO` / `DROPLIST` | options come from a `FROM()` queue or dictionary file, not static | `Select` / `Combobox` (shadcn) wired to the data source; large lists → async combobox |
| `IMAGE` | image display/picker | Tailwind grid + **Yet Another React Lightbox** (MIT); upload via **react-dropzone** (MIT) |
| `OLE` / `CUSTOM` / ActiveX | host control, no web analogue | replace with a purpose-built React component; surface to the developer |
| Rich text (third-party Clarion editors) | — | **TipTap** (MIT core) |
| Charts (graphing templates) | — | **shadcn/ui Charts** (Recharts, MIT) |

## Clarion picture tokens → input format / validation

The picture on an `ENTRY`/dictionary field is the format + implied length. Common tokens:

| Picture | Meaning | React mapping |
|---|---|---|
| `@sNN` / `@SNN` | string, length NN | `Input maxLength={NN}` / `VARCHAR(NN)` |
| `@nNN` | numeric, NN digits | numeric input |
| `@nNN.M` | numeric, NN digits, M decimals | `NUMERIC(NN,M)`, numeric input |
| `@e12.4` | scientific/Euro numeric | numeric input, format on display |
| `@dN` | date, format N (`@d6` = MM/DD/YY) | date picker; store ISO date |
| `@tN` | time, format N | time picker |
| `@p…p` | pattern (phone, SSN) | masked input (`react-imask`) |
| `@k…` | key/colorful | review manually |

Always **surface** the picture rather than silently dropping it — it carries length, decimals, and
input mask the rebuild needs.

## Clarion field TYPE → SQL (faithful map)

Encoded in `clarion-dict-to-sql.py`. Lengths/precision recovered from the PICTURE when TYPE lacks them.

| Clarion TYPE | Postgres | Notes |
|---|---|---|
| `BYTE` | SMALLINT | 0–255 |
| `SHORT` / `USHORT` | SMALLINT / INTEGER | 16-bit signed/unsigned |
| `LONG` / `SIGNED` / `UNSIGNED` | INTEGER | 32-bit; common identity/PK |
| `ULONG` | BIGINT | unsigned 32-bit |
| `SREAL` / `REAL` | REAL / DOUBLE PRECISION | 4-/8-byte float |
| `DECIMAL(n,m)` / `PDECIMAL` | NUMERIC(n,m) | packed; preserve precision/scale |
| `STRING(n)` / `CSTRING(n)` / `PSTRING(n)` | VARCHAR(n) | CSTRING null-terminated; PSTRING length-prefixed |
| `DATE` | DATE | **integer days since 1800-12-28** in storage |
| `TIME` | TIME | **integer centiseconds since midnight** |
| `MEMO(n)` | TEXT | |
| `BLOB` | BYTEA | export as base64 when migrating |
| `BOOL` (Clarion 11) | BOOLEAN | older code uses BYTE 0/1 |
| `GROUP` | *(none)* | composite — flatten or model separately |

## Data migration reminders (also written into `rebuild/db/ER-diagram.md`)

- `DATE` and `TIME` are integers — convert during export, not in the loader.
- Strings are usually Windows-1252 → UTF-8; trim trailing spaces from `STRING`.
- Empty string / 0-date frequently means NULL — decide per column.
- TopSpeed/Btrieve files can't be read by SQL directly — export from Clarion to JSON first.
- Respect FK load order (parents before children).
