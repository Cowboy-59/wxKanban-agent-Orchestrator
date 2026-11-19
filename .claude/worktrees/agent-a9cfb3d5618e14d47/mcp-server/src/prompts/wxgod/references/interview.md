# The interview (step 5)

The interview runs **after** the evidence is read, so it asks only what the evidence could not answer.
In plan mode it also runs **after the review** (`references/review-and-brainstorm.md`). For each
question, first look for the answer in `docs/GOD-Brainstorm.md`, `ProjectOverview.md`, `stack.md`,
the `--dir` evidence, and the conversion output:

- **Found and clear:** show it pre-filled for the user to confirm, with its source. Example: "From
  ProjectOverview.md: about 40 users across 2 offices. Correct?"
- **Found but conflicting:** ask, quoting both sources.
- **Not found:** ask.
- **The answer would not change any document:** skip the question.

In new-project mode the overview is the evidence, and the questions NP1 to NP10 in
`references/new-project.md` § N3 are asked as well, in place of PD1 to PD5. In either mode the
delivery answer (web-based, installed, or both) pre-fills D1: an installed-only system points to the
internal office column.

Use `AskUserQuestion` for choices, in batches of up to four. Ask for numbers and dates in plain chat.
Anything still unanswered becomes an `ASSUMP-` row that uses the default below, and is listed in
customer document § 10. Never block the run waiting for an answer the defaults can cover.

## Product and delivery (plan mode)

The review opens with PD5, PD1, and PD2 (`references/review-and-brainstorm.md` § Opening
questions), so here they are normally pre-filled from `docs/GOD-Brainstorm.md` and only confirmed.
Ask them here only if the review did not settle them. In new-project mode the same questions are
NP10, NP7, NP5, NP8, and NP9.

| # | Question | What it drives | Default if unanswered |
|---|----------|----------------|-----------------------|
| PD1 | Will it be commercial (sold or licensed to others), or for your own organization's use? | The commercial items; PD3 | From the evidence (billing, licensing, or customer-account code), else own use, flagged ASSUMP |
| PD2 | Will the system being planned be web-based, installed, or both? | The projected SaaS cost (web-based), the installed-app items (installed), D1 | What it is today, from the evidence, flagged ASSUMP |
| PD3 | Commercial only: how many paying customers today or at launch, and after 12 months, and about how many users each? | Sizing of the projected SaaS cost; cost per paying customer | Today's customer count from the evidence, else one customer of the D2 size, and ten after 12 months, flagged ASSUMP |
| PD4 | Commercial only: what will each customer pay per month, per plan if there are several? | The price and margin in the projected SaaS cost (internal, never customer-facing) | Today's price from the evidence, else none: the document shows the break-even price only |
| PD5 | Are you building this for your own organization (internal build), or for a customer (consulting)? | Build vs buy or competitors (internal builds only) | Consulting when `--customer` names another organization, else internal, flagged ASSUMP |

## Deployment and database

| # | Question | What it drives | Default if unanswered |
|---|----------|----------------|-----------------------|
| D1 | Where should the system run: in your own office (your server), in the cloud, or distributed across several sites or regions? Or should we recommend one? | The highlighted column in the database table | Recommend from the evidence |
| D2 | How many named users, and how many at the busiest moment? How many sites or offices? | Sizing, high availability | From the evidence, otherwise ASSUMP |
| D3 | Must any site keep working while its internet connection is down? | The strongest pull toward a distributed design | No |
| D4 | How big is the data today, how fast does it grow, and which tables are largest? | Hosting tier, migration duration | From `rebuild/db/` or `pre-convert/`, otherwise ASSUMP |
| D5 | Any compliance or data-residency rules (HIPAA, PCI, SOC 2, GDPR, data that must stay in one country)? | Rules out some hosting; adds controls | None stated, recorded as ASSUMP |
| D6 | After a failure, how much recent data can you afford to lose, and how fast must you be back? (for example: at most 15 minutes lost, back within 4 hours) | Backup and failover design | Up to 24 hours lost, back within 1 business day, flagged as ASSUMP |
| D7 | Who will run the database day to day: your IT staff, us, or a managed cloud service? Any existing licenses or a preferred cloud provider? | Whether on-premises is realistic; managed vs self-run | Managed service |
| D8 | What service level will you promise users? Uptime (for example 99.9% a month), support hours, and how fast a problem gets a first response and a fix. | Failover and hosting tier, monitoring and alerting, the support and on-call model, the cost projection; for a commercial app, the terms of service | 99.5% uptime a month, business-hours support, first response the next business day, flagged ASSUMP |

D6 and D8 together set how much redundancy the hosting needs. Write the SLA into management plan
§ 7.1 and § 12, and into customer document § 7 as the service level the hosting is built to meet.

## Quality and readiness

| # | Question | What it drives | Default if unanswered |
|---|----------|----------------|-----------------------|
| QR1 | Must it meet an accessibility standard? WCAG 2.2 level AA is the usual bar, and the law in some markets and for public bodies. | Screen design, `/wxUIUXCodeReview`, test cases | WCAG 2.2 AA for a commercial or public app; basic keyboard and contrast support for an internal one; flagged ASSUMP |
| QR2 | Which languages must it support, including right-to-left ones? Which currencies, date formats, and time zones? | Text kept out of code from the first screen, formats, the work packages | One language, one currency, the users' time zone, flagged ASSUMP |
| QR3 | What data may be used for testing and demos: made-up data only, or a copy of real data with personal details masked? | A test- and demo-data work package; user acceptance testing; conversion parity runs | Made-up data; a masked copy of real data only with written approval |

A commercial app also gets a dependency license check before release, without a question: every
third-party package's license is listed, and licenses that require sharing source code (such as
GPL or AGPL) are flagged as a risk. It is a work package in the release phase (management plan
§ 12).

## Timeline and team

| # | Question | What it drives | Default if unanswered |
|---|----------|----------------|-----------------------|
| T1 | Target start date? Any hard deadline? | Dates in the estimate (`startDate`) | Working days only, no dates |
| T2 | How many hours a day will AI agents run under supervision? | `hoursPerDay` | 8 |
| T3 | How many people will review and approve the agents' work? | `reviewers`, often the limit with more agents | 1 |
| T4 | Whose name goes on the cover as "Prepared by"? | Customer document cover | git `user.name` |
| T5 | How many AI agents can this machine run at once? Pre-fill both numbers from `scripts/machine-capacity.mjs` (step 1): the machine maximum and how many fit right now, and what limits each. | `maxAgents`, the estimate's Option 2, and the limit on implementing agents. A lower answer (the cap) also limits the read-only helpers; the machine maximum does not | The detected machine maximum |

T5: a lower answer becomes `--cap=<n>` when `machine-capacity.mjs --write` runs in step 7. If the
agents will run on a different machine, run the script there, or set `maxAgents` to that machine's
number and record it as an `ASSUMP-`.

## Scope (top three only)

| # | Question | What it drives |
|---|----------|----------------|
| S1 | The highest-priority items marked Unknown, Conflicting, or Investigate: can you settle any of them now? Ask about at most three, P0 first. | Turns Unknowns into Confirmed, or into Open Questions |
| S2 | Conversion only: for elements the scopes left undecided, KEEP, MODERNIZE, or DROP? Ask only about the ones on the critical path. | Dispositions, work packages |

Put every answer in the management plan with its source ("interview, YYYY-MM-DD"). An interview
answer counts as **Confirmed** for planning purposes, but it does not override contradicting
evidence. If the two disagree, record the item as **Conflicting** and raise a GAP.
