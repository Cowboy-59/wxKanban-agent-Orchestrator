# Brand Instruction Document — Format Reference

**Version**: 1.0 · **Status**: normative · **Parent**: SCOPE-129 / SPEC-127

This is the format a brand instruction document must follow to be parsed. It is written **from a
real document** rather than invented, and the parser is written against this reference rather than
against any one example.

> **Why this file exists before any parser.** A format reference that nobody re-checks drifts from
> the files it claims to describe — that has already happened once on this codebase, where a design
> format document disagreed with every real file on disk. Any change to the parser changes this
> document in the same commit, and the corpus test in SPEC-127 fails if the two disagree.

---

## The shape

A document has two parts. **Part A is the brand**: base tokens, type, geometry, and the rules that
hold everywhere. **Part B is the mode layer**: a declared token contract and one block per named
mode. A document may carry Part A alone — that is what a captured brand looks like on day one.

Parsing is **deterministic**. No language model reads a brand document at any point.

---

## Required elements

### 1. The token contract

A fenced code block naming every token each mode must declare, grouped by heading. Group names are
free text; the token names are what matter.

````
```
COLOUR     --m-paper --m-card --m-rail --m-ink --m-body --m-accent
SEMANTIC   --m-ok --m-ok-bg --m-warn --m-warn-bg --m-crit --m-crit-bg
TYPE       --m-font-body --m-font-disp --m-font-data --m-font-fig
FORM       --m-radius --m-row --m-hazard
```
````

Every token name in this block becomes a contract entry. A name appearing twice is an error: it
makes the required count ambiguous.

### 2. Token kinds

Each contract token is classified, because only colours can be contrast-checked and only one kind
may legally hold a gradient.

| Kind | Holds | Example |
|---|---|---|
| `color` | a hex colour, and only a hex colour | `#EEF1F4` |
| `paint` | a colour **or** a gradient | `repeating-linear-gradient(45deg,#F5A524 0 8px,#0E1216 8px 16px)` |
| `length` | a CSS length | `8px` |
| `fontstack` | a font family list with fallbacks | `'Inter',system-ui,sans-serif` |
| `number` | a unitless number or ratio | `700`, `-.01em` |
| `keyword` | a CSS keyword | `uppercase` |

Classification is declared, not guessed. A document that does not classify its tokens is parsed
with every token treated as `color`, and any token whose value is not a hex colour is then reported
as unclassified rather than silently skipped.

### 3. One block per mode

Each mode is a heading naming it, followed by a fenced CSS block declaring **every** contract token.

````
### `standard` — the brand

- Axis: light
- Resting: yes

```css
--m-paper:#EEF1F4; --m-card:#FFFFFF;
--m-ink:#14181D; --m-body:#344256;
--m-accent:#2563EB;
--m-ok:#16A34A; --m-ok-bg:#DEF2E6;
--m-font-body:'Inter',system-ui,sans-serif;
--m-radius:8px;
--m-hazard:#DC2626;
```
````

Required per mode:

- **A name**, in backticks in the heading.
- **An axis** — `light`, `dark` or `preference`. Never inferred: a palette does not reveal intent,
  and a light-surfaced mode under a dark system preference renders mixed unless it says which it is.
- **A resting declaration.** Exactly one mode in the document is resting. It is what renders when
  nothing selects otherwise, and what the base stylesheet carries.
- **Every contract token.** A mode that omits one is a defect, not a fallback. Nothing is inherited
  from another mode, from the base theme, or from a default.

A document with **one** mode is valid and normal. A product that has already been built has one
look; alternative modes are added deliberately afterwards.

### 4. Roles

Which tokens play which part, so checks are written against roles rather than against one brand's
token names.

```
ROLES
surface: --m-paper
body:    --m-body
ink:     --m-ink
accent:  --m-accent
identity: --m-rail-bar
identity-surface: --m-rail
semantic: ok=--m-ok/--m-ok-bg warn=--m-warn/--m-warn-bg crit=--m-crit/--m-crit-bg
```

`identity` and `identity-surface` are optional; every other role is required. `accent` is required
because it carries links and the primary action, and omitting it from checking is what let two
modes in the reference document ship an unreadable action colour.

### 5. Typefaces

Four roles, each with a family and a real fallback stack.

| Role | Used for |
|---|---|
| `display` | page titles, section heads, card heads |
| `body` | everything else |
| `data` | identifiers, timestamps, table IDs |
| `figure` | large numeric figures |

A face with no fallback stack is an error. A face that fails to load without one falls back to a
browser default serif, which is precisely the silent failure a declared stack prevents.

### 6. Rules

Free-text statements, one per bullet, under headings that name their kind.

| Kind | Meaning |
|---|---|
| `invariant` | must remain true in every mode |
| `prohibition` | must never be done |
| `check` | an acceptance criterion the brand states about itself |
| `product` | a product rule the interface carries |

`product` rules matter most and are the ones no automated reading of a product can recover. A
statement such as *"warnings are advisory only; access is never blocked by a prestart result"* is
invisible in rendered CSS and can only come from a person.

---

## Captured documents

A document produced by capturing a built product carries the same shape, plus two things.

**Provenance per value.** Each value is marked as measured from the product or defaulted, so a
reviewer can tell what was observed from what was assumed.

**Unanswered prompts.** Every section that could not be derived is emitted as an explicit prompt
and left blank:

```
> UNANSWERED — product rules
> Nothing in a stylesheet records how this product behaves. State any rule the interface must
> carry, for example whether a warning blocks access or only raises a review.
```

Capture never invents a rule. A generated document that silently fabricated one would read as
authoritative, which makes it the most dangerous artifact this system could produce.

---

## Rejection

The parser rejects rather than degrades. Every rejection names the offending content **and** where
it was found. Nothing is skipped, coerced or partially imported — a half-imported brand that
reports success is worse than a refusal, because nobody goes looking for what was dropped.

Rejected:

| Condition | Why |
|---|---|
| No token contract block | There is nothing to validate modes against |
| A duplicated contract token | The required count becomes ambiguous |
| A mode missing any contract token | Completeness is the point of a declared contract |
| A mode declaring a token the contract does not name | Either the contract is incomplete or the value is stray |
| Zero or several resting modes | Exactly one is required |
| A missing or unrecognised axis | It is never inferred from the palette |
| A typeface with no fallback stack | It would fall back to a browser default |
| A required role naming a token the contract does not declare | The role map would point at nothing |
| An unrecognised section | Silence about unknown content is how drift enters |

## Never followed

A brand document may reference a website, a repository or a code kit. **None of them are ever
fetched.** Parsing and validation are entirely offline, and nothing about a document is transmitted
outward. The only network action in this system is capture, which reads a page the customer asks us
to look at and never carries a credential.
