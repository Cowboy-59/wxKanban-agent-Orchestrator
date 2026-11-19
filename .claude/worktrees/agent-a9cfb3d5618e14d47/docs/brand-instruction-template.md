# Brand Instruction Document — TEMPLATE

**Product:**
**Prepared by:**
**Date:**
**Version:** 1.0

> **How to use this.** Fill in every value below. Anything you leave blank is reported back to you
> by name, so a half-finished document is safe to send — you will get a precise list of what is
> still outstanding rather than a silent partial import.
>
> Delete any line you do not need, but delete it from **both** the token contract and the mode
> block, or it will be reported as a mismatch.
>
> The rules at the end matter more than the colours. They are the part no software can ever read
> from a product, and they are usually the most valuable thing this document says.

---

## 1. Token contract

Every token named here must be given a value in every mode below. Delete any you do not need.

```
COLOUR     --c-paper --c-ink --c-body --c-accent --c-accent-ink --c-rule
STATUS     --c-ok --c-ok-bg --c-warn --c-warn-bg --c-crit --c-crit-bg
IDENTITY   --c-identity --c-identity-surface
FORM       --c-radius
TYPE       --c-font-disp --c-font-body --c-font-data --c-font-fig
```

## 2. Token kinds

Each token's kind decides how it is checked. Only `color` tokens are contrast-checked, and only a
`paint` token may hold a gradient. Leave this table as it is unless you add a token.

| Token | Kind | What it is |
|---|---|---|
| `--c-paper` | color | The page ground everything sits on |
| `--c-ink` | color | Headings and high-emphasis text |
| `--c-body` | color | Running body text |
| `--c-accent` | color | Links and the primary action |
| `--c-accent-ink` | color | Text that sits on the accent colour |
| `--c-rule` | color | Hairlines, dividers, field borders |
| `--c-ok` | color | Verified, passed, healthy |
| `--c-ok-bg` | color | The chip that `--c-ok` text sits on |
| `--c-warn` | color | Pending, attention needed |
| `--c-warn-bg` | color | The chip that `--c-warn` text sits on |
| `--c-crit` | color | Failed, stopped, irreversible |
| `--c-crit-bg` | color | The chip that `--c-crit` text sits on |
| `--c-identity` | color | Identity only — a logo or marker, never an action |
| `--c-identity-surface` | color | The surface the identity mark sits on |
| `--c-radius` | length | Base corner radius |
| `--c-font-disp` | fontstack | Titles and section heads |
| `--c-font-body` | fontstack | Everything else |
| `--c-font-data` | fontstack | Identifiers, timestamps, table IDs |
| `--c-font-fig` | fontstack | Large numeric figures |

## 3. Roles

Which token plays which part. Leave as is unless you renamed a token.

```
ROLES
surface: --c-paper
body: --c-body
ink: --c-ink
accent: --c-accent
identity: --c-identity
identity-surface: --c-identity-surface
semantic: ok=--c-ok/--c-ok-bg warn=--c-warn/--c-warn-bg crit=--c-crit/--c-crit-bg
```

## 4. Typefaces

Every face needs a fallback stack. Without one, a face that fails to load drops to a browser
default serif — which is the single most visible way a brand breaks in the wild.

| Role | Family | Fallback stack |
|---|---|---|
| display | | |
| body | | |
| data | | |
| figure | | |

## 5. Modes

Most products have **one** look, and one mode is a complete and normal document. Add a second block
only if you genuinely want an alternative presentation — a high-contrast outdoor version, a darker
display for a wall screen, a print-safe version for documents.

Exactly one mode must say `Resting: yes`. That is the one that renders when nothing selects
otherwise.

`Axis` says how the mode relates to a viewer's light/dark system preference. It is never guessed
from your colours, because a white surface is not necessarily a light mode.

### `default` — the product's look

- Axis:
- Resting: yes

```css
--c-paper: ;
--c-ink: ;
--c-body: ;
--c-accent: ;
--c-accent-ink: ;
--c-rule: ;
--c-ok: ;
--c-ok-bg: ;
--c-warn: ;
--c-warn-bg: ;
--c-crit: ;
--c-crit-bg: ;
--c-identity: ;
--c-identity-surface: ;
--c-radius: ;
--c-font-disp: ;
--c-font-body: ;
--c-font-data: ;
--c-font-fig: ;
```

---

## 6. Invariants — what must remain true everywhere

State anything that must hold on every screen, in every presentation. Write one per line.

- 
- 
- 

*Examples of the kind of thing that belongs here: which colour may carry the primary action; which
colour is identity only and must never become a button; whether a tab is underlined or filled.*

## 7. Prohibitions — what must never be done

- 
- 
- 

*Examples: never use the status red for a warning; never place the identity colour on an action;
never use a native browser control.*

## 8. Product rules carried in the interface

**This is the most important section, and the only one that cannot be recovered from a product.**
Colours and type are visible in rendering. How the product behaves is not.

- 
- 

*The kind of statement that belongs here: "a failed check is advisory and never blocks access — it
raises an investigation instead." That sentence changes how every screen is built, and no automated
reading of a product would ever find it.*

## 9. Acceptance checks — how you would know it is right

- 
- 

*State these as things that can be observed, and say which need a person. "Every mode defines every
token" can be checked automatically; "legible on the workshop wall screen" needs someone standing
in front of it, and it is better to say so than to imply a machine is checking.*

---

## What happens next

Send this back however is convenient. It will be read and you will get a report covering:

- **Completeness** — every declared token given a value in every mode
- **Readability** — each colour pairing measured against WCAG AA, with the numbers
- **Distinguishability** — colours that must not be confused measured against each other
- **Fallbacks** — every typeface has a real stack behind it

Anything that falls short is named with its measurement. Nothing is silently corrected: your
colours are yours, and any change is yours to make.
