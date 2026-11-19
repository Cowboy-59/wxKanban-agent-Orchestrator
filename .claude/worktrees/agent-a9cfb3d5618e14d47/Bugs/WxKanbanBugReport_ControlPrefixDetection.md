# Bug report — `/wxConversion` Stage 2 fails silently on non-default control names

**Affects:** `wxConversion` skill, `scripts/pcsoft-page-to-react.py` (Stage 2 — regenerating
pages as React/Tailwind/shadcn components from the split `pre-convert/*.controls.md` dumps).

**Severity:** High for any project that doesn't use WinDev's auto-generated control names —
produces an empty or near-empty page with no error, so the failure is easy to miss.

## Summary

Stage 2 only recognizes a control if its name carries a WinDev-IDE-auto-generated type prefix
(`EDT_`, `BTN_`, `CHK_`, `TABLE_`, etc., matched via a regex requiring a trailing underscore). Any
project where controls have been renamed to meaningful, descriptive names — a common practice for
experienced developers, and standard once a "code style" naming option is enabled in the WinDev
project (which only applies to newly-created controls, not retroactively) — produces almost no
parsed controls, with **no error or warning printed**. The page still "succeeds" and writes a
`.tsx` file; it's just empty.

## Concrete reproduction

Test project: a real 25-year-old production WinDev/WebDev application, two windows converted from
a scoped technical-documentation PDF export (`CR_Tab` — a creditor list/browse screen with a Table
control, and `CR_Fic` — the paired detail/edit screen).

**Before fix:**

```
cr_fic: 3 controls parsed, 3 root zones
cr_tab: 0 controls parsed, 0 root zones
```

Both `.tsx` outputs were essentially empty shells (`cr_tab.tsx` had no table, no columns, nothing
— just an empty `<main>`), despite the source `pre-convert/*.controls.md` dumps containing full,
correct control data.

**Root cause:** `CR_Tab`'s Table control is named literally `TABLE` (no separator, so
`PREFIX_RE = re.compile(r"^([A-Za-z]+)_")` never matches). `CR_Fic`'s controls are named things
like `CONMobile`, `CONPhone`, `CRDisputeReason` — meaningful names, again with no recognized
prefix. `is_control_header()` requires a prefix match as a precondition, so every one of these
controls is invisible to the parser, regardless of the underlying dump being complete and correct.

## Suggested fix

Each control block in the dump is still announced by a literal, unambiguous **type header** even
when the control's own name carries no prefix — either a bare header line (`Table`, `Check Box`,
`Edit`, `Image`, ...) shared across a run of similarly-typed controls, or a
`"<Type> : <Name>"`-style line for individually-detailed controls (`Button : BT_ACTIVE`,
`Table : TABLE`, `Window : cr_tab`). Tracking this as a **fallback classification** — used only
when the name-prefix match fails — recovers full control detection with no dependency on naming
convention at all.

Patch applied locally (validated against the reproduction case above, not just theorized):

- Track the most recently seen type-header line as a fallback `kind` for the current parsing
  state.
- Recognize the `"<Type> : <Name>"` form directly — it gives the control's name and kind
  unambiguously, and also marks a section boundary (important: seeing one of these must reset any
  in-progress fallback-kind tracking from the block-style section before it, or a label specific to
  the new section, e.g. `Opacity`, gets misread as more rows of whatever preceded it — a real
  second-order bug this same reproduction case surfaced).
- Tie `"Table column"` entries back to their owning table via the `"Table : <name>"` declaration
  that precedes them in the dump, since column names in this format aren't dotted-path-qualified.

**Result after fix:**

```
cr_fic: 506 controls parsed, 165 root zones
cr_tab: 72 controls parsed, 20 root zones
```

`cr_tab.tsx` now contains a real `<table>` with all 23 real columns, in the correct order,
matching the source window's actual column list exactly. `cr_fic.tsx` recovers hundreds of real,
correctly-named controls (checkboxes, buttons, inputs) matching genuine business fields.

## Known remaining gap (not yet fixed, lower priority)

A column/control caption that **wraps across multiple lines** in the dump (e.g. a two-line title
like "Purchases" / "GL Account" printed on separate lines) can still be misread as if each line
fragment were a separate control name, since the current fix reads captions token-by-token rather
than as one contiguous multi-line value. This produced a handful of stray extra entries after the
real ones in our test (5 out of 28 total column-list entries). Workaround on the source side: the
WD Table control's Detail pane has a "Force title to single line (8)" option (default is
multi-line) that avoids the wrapping entirely if enabled before export.

## Suggested priority

This is likely to affect more than one project — any WinDev/WebDev developer who renames controls
away from the IDE's auto-generated defaults (or has done so for years, as in our case) will hit the
exact same silent-empty-page failure. Given it fails **silently** rather than erroring, it's also
the kind of gap that could easily go unnoticed until someone happens to check the actual `.tsx`
output rather than just the console's "N controls parsed" line.

Happy to share the patched script directly if useful for comparison.
