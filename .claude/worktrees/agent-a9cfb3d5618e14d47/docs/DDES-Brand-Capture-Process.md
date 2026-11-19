# ProActive Brand Capture

**Prepared for:** Darling Downs Earthmoving Solutions
**Subject:** How your brand would be captured, approved and applied across ProActive
**Date:** 18 September 2026

> **Status: proposed process.** This describes a capability that is designed but not yet built. It is circulated so the approach can be agreed before development starts. Nothing described here is live today.

---

## Why this exists

ProActive is a large application — five modules, seventy-three routes, and around a hundred and ninety separate screens. Keeping a consistent look across that many surfaces is not something a style guide achieves on its own. A written guide describes intent; it cannot stop a screen being built that quietly disagrees with it, and nobody discovers the drift until someone opens the screen.

The aim here is to turn your brand from a document people are trusted to remember into something the build process checks against automatically.

The starting point matters: **most organisations do not have a written brand specification. They have a working application.** The brand is already there, expressed in the product you have built. So the process begins by reading what exists rather than asking you to write something from scratch.

---

## The process at a glance

| Stage | You do | We do | Result |
|---|---|---|---|
| 1. Capture | Point the tool at your product | Read the styling actually in use | A draft brand document |
| 2. Review | Edit it and answer the open questions | — | A document you own |
| 3. Upload | Attach it to the project | — | — |
| 4. Validate | Read the report | Check completeness, contrast and consistency | A clear pass or fail, before anything is saved |
| 5. Decide | Correct it, or accept with reasons noted | Record what was accepted | An approved brand |
| 6. Apply | Select it company-wide | Make it resolve for every project | One brand across the business |
| 7. Generate | — | Produce the stylesheets and components | Real files for your product |
| 8. Maintain | Build as normal | Check every new screen against the brand | Drift caught as it happens |

---

## The stages in detail

### 1. Capture — read what you already have

The tool opens your product the way a browser does and records the styling genuinely in use: colours, typefaces, spacing, corner radii, the treatment of panels and tables.

What comes back is a **draft**, not a finished answer. Two limits are worth stating plainly:

- **It captures one look.** A product that has been built has a single appearance. If you later want alternative presentations — a high-contrast version for use outdoors, a darker one for a workshop wall screen, a print-safe version for certificates — those are added deliberately afterwards. The tool will not invent them.
- **It cannot read your rules.** Colours and type are visible in the product. Intent is not. Nothing in a stylesheet records a statement such as *"warnings are advisory only; access is never blocked by a prestart result — a red result raises an investigation instead."* That is among the most important things about how ProActive behaves, and no automated reading of the product will ever recover it.

So every part of the document that cannot be measured comes back as **an explicit open question**, left blank for you to answer. It is never filled in with a plausible guess. A document that invented your rules would be worse than no document at all, because it would read as though it were authoritative.

### 2. Review — the document is yours

The draft is a plain, readable document. You edit it: correct anything the capture misread, and answer the open questions it left.

This is the stage that does the real work. The capture supplies the mechanical detail so that your effort goes into the part only you can supply — the intent behind it.

### 3. Upload

The completed document is attached to the project.

### 4. Validate — before anything is saved

The document is checked, and the report is shown to you **before** the brand is stored. Checks include:

- **Completeness** — every declared colour and typeface is actually defined, with nothing left to chance.
- **Readability** — colour combinations are measured against the recognised accessibility standard for text contrast, and reported with their measured values.
- **Distinguishability** — colours that must not be confused with one another are measured to confirm they are far enough apart.
- **Type fallbacks** — every typeface names a substitute, so a font that fails to load never leaves the product looking broken.

Where something falls short, the report names it and gives the measurement. It does not quietly correct your brand. Your colours are your property, and any change is yours to make.

This step is often the most immediately useful part of the process, because it examines the product as it stands today rather than as it was intended.

### 5. Decide

You either revise the document and resubmit it, or accept it as it stands with the exceptions recorded. Accepting is a legitimate choice — it simply means the decision is written down rather than forgotten.

### 6. Apply company-wide

The approved brand is selected once, at company level, and every project in your account then resolves to it. It does not have to be applied project by project, and no project quietly falls back to a partial version.

### 7. Generate

The brand is turned into real files for your product — stylesheets, configuration, and styled components ready to use. These are outputs you own and can inspect.

### 8. Maintain

From this point the brand is active in the build process rather than sitting in a folder:

- Screens are designed against your tokens rather than approximations of them.
- New code is written with your rules supplied as context.
- Reviews check changes against the brand.
- Automated checks reject a component that hard-codes a colour instead of using a brand token, and reject any change that alters the structure of a screen under the guise of styling it.

That last point is the durable one. Across a hundred and ninety screens, consistency is not maintained by care and memory. It is maintained by something that checks.

---

## What we would need from you

1. **A way to see the product.** The capture reads a running application. ProActive's working screens sit behind a login, so we would need to agree how this is done — a publicly reachable page as a starting point, a set of exported pages you supply, or arranged access. This is worth settling early, as it carries security implications we would want to handle deliberately rather than by convenience.
2. **Answers to the open questions** the draft leaves — principally your rules and the intent behind them.
3. **A decision on anything the validation flags**, whether to correct it or to accept it with the reason recorded.

---

## Open points

- **Access for capture**, as above — the main practical question.
- **Whether alternative presentations are wanted**, and if so which. The capture produces your current look; additional modes for outdoor use, workshop displays or printed documents would be defined separately.
- **Print and document output.** ProActive produces a great many certificates, reports and invoices, and a brand intended for screens does not always transfer to paper unaltered.

---

## Status and next step

This is a proposed process circulated for agreement. No development has begun, and no commitment to a delivery date is implied by this document.

The useful next step is a short conversation on the access question in the first item above, since it determines how the first stage can work in practice.
