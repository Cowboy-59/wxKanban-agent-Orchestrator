# ProActive Brand Schema v1.0 — Findings

**To:** NOW Group
**From:** wxperts
**Re:** ProActive by DDES — Brand & Theme Instruction v1.0 (2026-09-15)
**Date:** 19 September 2026

---

We have been building your brand document into wxKanban as an executable schema — parsed, validated,
and enforced against generated code rather than held as a reference for people to remember. That work
is going well, and the document is a pleasure to work from: the token contract is complete, all six
modes declare all forty-one tokens with nothing missing and nothing stray, and the intent behind each
mode is clear enough to implement without asking.

Building it does, however, put every value through measurement, and three things came out that we
think belong with you rather than with us. Two are contradictions inside the document's own
acceptance criteria. The third is a list of additions needed to make the document machine-readable.

Every number below is measured, not estimated, and we are happy to share the method.

---

## 1. `standard` fails WCAG AA on all three semantic colours

Measured against both plausible pairings — as text on the page ground, and as text on its own
background chip:

| Role | on `--m-paper` `#EEF1F4` | on its own `-bg` chip |
|---|---|---|
| `--m-ok` `#16A34A` | 2.91 : 1 | **2.82 : 1** |
| `--m-warn` `#E8730A` | 2.69 : 1 | **2.58 : 1** |
| `--m-crit` `#DC2626` | 4.26 : 1 | **3.89 : 1** |

AA for body text is 4.5 : 1. Two of the three fail even the 3.0 : 1 allowance for large text, so
they do not pass at any size.

These are the Part A values (`--success`, `--warning`, `--destructive` on `--background`), so this is
a base-palette matter rather than an artifact of the mode layer.

**The structural part.** B7 lists `instrument`, `psikiq` and `psikiqPaper` as the modes that must pass
AA. B8 says *"Do not make `standard` prettier."* Between them, the mode that ships by default is the
only one never contrast-checked and the only one that may not be adjusted. We do not think that was
intended, and it is the kind of gap that survives review precisely because each rule reads sensibly on
its own.

This matters more here than in most applications: `--m-crit` carries machine-down and RED-clearance
state, read by a fitter at a bench.

**Our position:** we will store your values exactly as written. We will not silently repair a brand
hue — it is yours. We would rather you decide.

---

## 2. Gold on the rail bar is invisible in two modes

B5 makes `--m-rail-bar` an invariant: DDES gold `#FFC700`, which no mode may substitute. B7 requires
that the rail bar be distinguishable at a glance. In two modes those two rules cannot both hold, because
the rail itself is white or off-white:

| Mode | `--m-rail` | Bar against rail |
|---|---|---|
| `standard` | `#1B2735` | 9.67 : 1 |
| `instrument` | `#080B0E` | 12.61 : 1 |
| **`field`** | `#FFFFFF` | **1.56 : 1** |
| **`ledger`** | `#FCFCFA` | **1.52 : 1** |
| `psikiq` | `#0F0B06` | 11.15 : 1 |
| `psikiqPaper` | `#FBFAF7` | 3.49 : 1 |

A 3px bar is a graphical object, so the relevant threshold is 3.0 : 1, not 4.5 : 1. `field` and `ledger`
fall well below it — the identity mark effectively disappears on the two light-railed modes.

`field` is the mode built for daylight, glare and gloves, which makes it the one where a lost identity
mark is least acceptable.

Either the invariant gains a light-rail exception, or those two modes accept an identity mark that is
not visible. That is a brand decision and we would not want to make it for you.

---

## 3. Two smaller things in the same area

**B7's AA list omits `--m-accent`.** Accent carries links and the primary action, so it is text. Two
modes fail it: `field` at 4.14 : 1 and `psikiqPaper` at 3.64 : 1, both on their own paper. Neither is
currently checked, because accent is not in the list.

**"Distinguishable at a glance" cannot be tested as written.** We have implemented it as a minimum
perceptual distance (CIE76) with a threshold of 20, chosen so that `instrument` — the case B7 itself
calls the tightest — passes at 21.1 and 24.2. On that basis four pairings fail:

| Mode | Pairing | Distance |
|---|---|---|
| `psikiq` | `--m-rail-bar` vs `--m-accent` | **0.0** — same value, `#E6BE6A` |
| `psikiqPaper` | `--m-rail-bar` vs `--m-accent` | **0.0** — same value, `#A8801E` |
| `psikiqPaper` | `--m-rail-bar` vs `--m-warn` | 15.8 |
| `psikiqPaper` | `--m-accent` vs `--m-warn` | 15.8 |

The two zero-distance pairings are the useful ones to look at: in both PsikiQ modes the identity colour
and the accent colour are literally the same hex. That may well be deliberate — PsikiQ gold is the
accent there — in which case B5's *"do not let a mode's accent onto the rail bar"* and B7's
distinguishability requirement are pulling against each other, and it would help to know which wins.

Also worth confirming: `psikiqPaper`'s `--m-warn` measures 4.50 : 1 on paper, sitting exactly on the AA
threshold. We compare before rounding, so tiny future adjustments could flip it either way. A little
headroom there would make it stable.

---

## 4. Fourteen declarations we need to parse the document automatically

These are **not defects**. The document was written for people, and it reads well. To have software
read it without guessing, four things need stating explicitly. Our parser deliberately refuses to infer
any of them, because a wrong inference would produce a schema nobody had audited.

| Needed | Count | Why it cannot be inferred |
|---|---|---|
| A `light` / `dark` / `preference` declaration per mode | 6 | A white surface is not necessarily a light mode — `psikiqPaper` is white but print-targeted. Without it, a light-surfaced mode under an OS dark preference renders mixed |
| A resting declaration per mode | 6 | The document says `standard` "is the resting state" in prose; software needs it as a field |
| A `ROLES` block | 1 | So checks run against roles — surface, body, ink, accent, the status pairs — rather than against one brand's token names |
| A kind per contract token | 1 (covers 41) | A gradient is indistinguishable from a malformed colour unless the document says a token may hold one. `--m-hazard` is the case that matters |

We have written a short format reference describing exactly what these look like, and can send it with a
fillable template if that is useful. It is roughly twenty lines of additions to a document that is
otherwise complete.

---

## What we are doing meanwhile

Storing your values exactly as written, reporting these measurements rather than absorbing them, and
holding the two brand decisions (items 1 and 2) open until you have made them. Nothing is being quietly
adjusted.

Item 3 we can proceed on with a one-line confirmation. Item 4 we can draft for you to review, if you
would rather not write it yourself.

Happy to walk through any of the measurements.
