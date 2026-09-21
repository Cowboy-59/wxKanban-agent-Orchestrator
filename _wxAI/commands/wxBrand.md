---
description: wxBrand — capture a product you have already built into a brand instruction document, ingest a completed one, or start from a blank template; validate it and report every failure with its measurement; then execute it into real stylesheets and components. Never handles customer credentials. Reports; never silently repairs a brand.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxBrand — Brand Schema

Turns a customer's brand into something the build process checks against, instead of a document
people are trusted to remember.

Most customers have no written brand. They have a working application whose brand is already there,
expressed in what it renders. So the usual path starts by **reading what exists** rather than asking
anyone to write a specification from nothing.

## Modes

| Invocation | What it does |
|---|---|
| `wxBrand capture <url>` | **Primary.** Reads a reachable page and produces a draft brand document |
| `wxBrand template` | Emits a blank brand instruction document to fill in |
| `wxBrand ingest <path>` | Reads a completed document, validates it, reports |
| `wxBrand execute <project>` | Turns a stored schema into stylesheets and components |

All four produce or consume the **same document**. One format, one parser, one validation report,
however the document came to exist.

## What capture can and cannot do

It reads colours, type, spacing and radii from what the product actually renders. Everything it
reads is marked **measured**; anything absent is marked **default** and explains itself.

It **cannot** read rules. Nothing in a stylesheet records that a failed check is advisory and never
blocks access — and that sentence changes how every screen is built. Those sections come back as
explicit unanswered prompts, never as plausible filler. A document that invented a rule would read
as authoritative, which makes it the most dangerous thing this command could produce.

It produces **one mode**. A product that has been built has one look. Alternative presentations — a
high-contrast outdoor version, a darker wall-screen version, a print-safe version — are added
deliberately afterwards. Capture never invents them.

## Credentials

**Never.** Capture accepts a page it can reach, or a rendered page the customer supplies. It does
not accept, store, forward or replay a credential, and does not authenticate against a customer
system. How a customer makes a representative page available is their decision.

This is a permanent boundary, not a missing feature. The value of this path is that it only ever
reads public rendering.

## What validation reports

- **Completeness** — every declared token given a value in every mode
- **Readability** — every colour pairing measured against WCAG AA, including the status colours and
  the action colour, judged on the unrounded ratio
- **Distinguishability** — colours that must not be confused, measured as a perceptual distance
- **Fallbacks** — every typeface backed by a real stack

Failures are named with their measurements. **Nothing is silently corrected.** A brand hue belongs
to the customer; any change is theirs to make.

## What execute emits

`brand.css` with each mode scoped to the shell root and the resting mode written without a selector,
one font request covering every face in every mode, the shell contract, a Tailwind theme, a typed
mode module, and a human-test checklist for the checks a machine cannot decide.

## Boundaries

| Surface | Relationship |
|---|---|
| Theme Studio | A brand schema rides the same carrier chain; wxBrand does not re-implement theme picking |
| wxDesigner | Consumes brand tokens and rules when designing; wxBrand does not design screens |
| implement | Receives brand rules as build context; wxBrand does not write application code |
| Design system catalog | Global and read-only — a curated look, not a tenant's brand |

Run `wxBrand` with no arguments for the interactive path.
