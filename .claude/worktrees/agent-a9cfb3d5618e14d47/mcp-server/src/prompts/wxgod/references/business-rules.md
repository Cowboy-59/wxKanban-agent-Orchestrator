# Business rules: extract them all, add best practices, discuss them

Used in every mode:

- **Plan mode, any project with code** (converted or not): every business rule is pulled out of the
  code during the intake (step 4), best-practice rules are added beside them, and both are discussed
  in review section 2, Business rules.
- **New-project mode** (no code yet): the brainstorm starts with best-practice rules, right after the
  opening questions (`new-project.md` § N2b). Approved rules become functional requirements in
  the scope drafts.

The register they all go into is `docs/GOD-Business-Rules.md` (format below).

## What counts as a business rule

A statement of what the business allows, requires, or calculates, true whatever the screen looks
like. Write each one in plain words, so that it can be tested: "A posted invoice cannot be deleted;
it can only be voided with a credit note". Never write it as code: not "btnDelete is disabled when
Status = 2".

| Kind | Examples |
|---|---|
| Validation | required fields, ranges, formats, a date that must fall after another |
| Calculation | totals, tax, discounts, rounding, commissions, interest |
| Default | a value filled in for the user, and when |
| Workflow | the statuses a record moves through, the allowed moves, approvals |
| Authorization | who may see, create, change, approve, or delete what |
| Constraint | uniqueness, "cannot delete while…", limits per customer or plan |
| Timing | due dates, cut-offs, periods that close, expiry, reminders |
| Numbering | how document numbers are made, and whether gaps are allowed |
| Trigger | what happens automatically when something changes (emails, postings, stock moves) |
| Retention and audit | what must be kept, for how long, and who changed what |

Not business rules: layout, colors, control positions, navigation with no business meaning, and
technical plumbing such as connection handling or logging. A validation attached to a screen
control *is* a rule.

## Extracting them from existing code (plan mode)

**Every code file is read in full.** This is the one part of the intake that is never sampled.
Step 4's sampling by risk does not apply to it.

**Sources**, from the inventory only (gitignored, kit, and `secret`-bucket files are never read):

- **Conversion output** (bucket `conversion`): every `pre-convert/` element document (windows or
  pages, reports, procedures, classes, queries, tables), `rebuild/pages/*.tsx`,
  `rebuild/db/schema.*.sql` (constraints, defaults, triggers), and `rebuild/scopes/`. A conversion
  scope's KEEP / MODERNIZE / DROP decision on a rule stands (Preserve / Modernize / Retire).
- **Ordinary source** (buckets `code` and `database`): domain and service logic, validation,
  controllers and handlers, SQL, migrations, stored procedures, triggers, reports, and scheduled jobs.
- **Supporting evidence**: tests (bucket `test`) show the outcomes the code is expected to give, and
  configuration (bucket `config`) can hold rates and thresholds. A rule seen only in a test is
  **Likely**, not Confirmed.

**Procedure:**

1. **Slice the files.** Split the inventory's code, database, and conversion files into slices, one
   area, module, or element group each, sized so that one helper can read every file in its slice
   in full. List the slices, each with its files and a status, in
   `docs/GOD-Intake/business-rules/README.md`.
2. **Read every slice.** Launch read-only helpers, at most 5 at once and never more than the user's
   cap; the machine maximum does not limit them (`SKILL.md` Rules, "At most 5 helpers at once").
   Each one reads every file in its slice in full and returns:
   - the rule rows (the register's columns below), each citing `file:line`;
   - a coverage row for every file: the number of rules found, "no rules", or "could not read" with
     the reason.

   Brief each helper with the kinds table above and this format. Helpers never copy code longer than
   one line, and never copy a literal value that could be a credential; they cite its location.
   Save each report verbatim to `docs/GOD-Intake/business-rules/<n>-<slice>.md` as it returns.
3. **Prove the coverage.** Every inventoried code, database, and conversion file appears in exactly
   one slice's coverage table. A missing or unreadable file is a GAP. Never say the extraction is
   complete until every file is accounted for; until then, report it as "n of N files".
4. **Keep going across checkpoints.** A large system takes more than one conversation. Record the
   progress in `docs/GOD-State.json` (`"rulesExtraction": { "slices": 40, "done": 12 }`). A
   checkpoint between slices is normal, and `--resume` continues with the next unread slice.
5. **Merge into the register.**
   - The same rule enforced in several places is one rule, with every citation.
   - Two implementations that disagree (the screen allows 30 days, the report assumes 45) are one
     rule marked **Conflicting**, with both citations.
   - A rule enforced only in the screen, and not on the server or in the database, is marked
     "screen only". It is a risk for a rebuild, because a web API must enforce it too.
6. **Compare with best practice** (below). Next to each legacy rule that falls short, put the
   better rule as a best-practice proposal.

This extraction carries out the persona's WP-DISC-002 (UI-embedded business rules) up front. When
coverage is complete, the plan does not repeat it; only its gaps remain as work.

## Best-practice rules (every mode)

G.O.D. proposes the rules a well-run business of this kind usually has but this code or overview
lacks. Derive them from this project's domain, entities, and workflows, not from a fixed list. Some
common families, to start from:

- **Money:** posted financial records are never edited or deleted, only reversed; amounts are
  rounded once, at a stated point; the currency is stored with the amount; tax comes from a dated
  rate table.
- **Numbering:** document numbers are unique and never reused, and sequential without gaps where the
  law requires it.
- **History and audit:** a record of who changed what and when, for money, permissions, and
  personal data; records with history are archived, not deleted.
- **Workflow:** a defined status list with its allowed moves; approval above a stated amount; the
  person who creates a payment is not the one who approves it.
- **Data quality:** rules are checked on the server as well as on the screen; duplicates are caught
  at entry (a customer by email or tax ID).
- **Time:** dates stored in one time zone; closed periods locked against change.
- **Personal data:** a retention period, and deletion on request, when D5 names a privacy law.
- **Access:** each role gets the least access it needs; accounts lock after repeated failed sign-ins.
- **Commercial systems:** each customer's data kept apart; plan limits enforced on the server;
  failed payments handled with a grace period.

Label each one **Best practice (proposed)**, with one line on the risk it prevents and why it fits
this project. Never present one as something the system already does. Propose only rules that fit
this project; an unfitting rule only wastes the user's time. Rules the user adopted or declined on
earlier projects (the learnings file) shape the proposals, and each such proposal says so. At amateur
level, teach the practice as well as proposing the rule.

## The register: `docs/GOD-Business-Rules.md`

G.O.D.'s working document, like `docs/GOD-Review.md`. Plan mode writes it once the extraction is
merged; new-project mode writes it with the best-practice proposals before the brainstorm. After
that, it changes only when the user approves a summary. Keep every `BR-` ID stable across re-runs:
retire a rule with a status, never renumber.

Open with a summary table, one row per area:

| Area | Rules | Conflicting | Screen only | Falls short of best practice | Best practice proposed | Decided |

Then one table per area:

| ID | Rule (plain words) | Kind | Source | Enforced in | Confidence | Best practice | Disposition | Status |

- **Source:** the `file:line` citations; "Best practice (proposed)"; or "Overview".
- **Enforced in:** screen, server, database, report, or job: where the code enforces it today.
- **Confidence:** the persona's labels (Confirmed, Likely, Assumed, Unknown, Conflicting, Deprecated).
- **Best practice:** "meets it", "falls short (see BR-nnn)", or blank.
- **Disposition:** for a legacy rule, the persona's Preserve, Modernize, Retire, or Investigate; for a
  best-practice rule, Adopt or Decline.
- **Status:** Suggested, Agreed, Changed, Dropped, or Open.

## Discussing them

Section 2 of the review takes the rules one area at a time, in plain text, with the list shown again
before every "which next?", and nothing written until the user approves the area's summary. An area
the user wants to talk through at more length is noted for the brainstorm offer after the review
(`review-and-brainstorm.md` § Offering the brainstorm), where wxBrainstorm takes it.

**Order inside an area.** A large system can have hundreds of rules, so never walk them one by one
unless the user asks. Show the area's summary row, then the rules that need a decision, in this order:

1. Conflicting
2. Screen only
3. Falls short of best practice, each with its proposed better rule
4. Best practice proposed

Then offer the rest as one group: "The other 38 rules in Invoicing look ordinary. Approve them as
they are, or go through them?" "explain" on a rule gives its citations and what the code does.

- **Plan mode:** review section 2, Business rules (`review-and-brainstorm.md` § The five sections).
- **New-project mode:** the first topic after the opening questions (and, for an internal build,
  build vs buy), area by area, using the
  features the overview names. If the idea brainstorm is skipped, the proposals are listed in the N6
  design summary under "For discussion", and the N6 brainstorm takes them up there.

## Where approved rules go

- Each approved decision goes to `docs/GOD-Brainstorm.md`, which makes it Confirmed. The register's
  Status column is updated to match.
- **Management plan:** § 3 summarizes the rules by area and links the register. Every rule to
  change, adopt, or move to the server becomes work in the work package for its area, and that
  package's acceptance criteria cite the `BR-` IDs.
- **New-project mode:** each approved rule becomes a functional requirement, with its acceptance
  criteria, in the scope draft for the scope that owns its area, citing the `BR-` ID. That way
  `/buildscope --from-md` carries it.
- **Plan mode:** rules the user marks for the scope and specs follow the step 12 path.
- **Customer document:** § 4 states, in plain words, the rules that change and why (two to five
  points, the most important first). The decisions still open go in § 9.
