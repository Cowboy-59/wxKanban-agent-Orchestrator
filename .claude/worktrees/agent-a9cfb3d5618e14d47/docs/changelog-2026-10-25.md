# wxKanban Changelog — Week of October 18 – 25, 2026

_Published 2026-10-25. Source: `changelog.md` (the weekly section stays open until the final release)._


Releases this week: app 1.5.344 → 1.5.352, kit v1.7.83 → v1.7.85, Cockpit 0.2.44 → 0.2.46.

#### SPEC-147 — Security: every System Administrator change is now recorded (Oct 25, app 1.5.352)

- **New: a durable record of every change a System Administrator makes.** Suspending a company, changing a user's role, resetting a password, deleting a company, editing settings, sending a newsletter, editing marketing content — all 87 SysAdmin routes that change data now leave one audit entry with who, what, when, the target, and the values before and after. Before this, none of them did.
- **Secrets never reach the record:** passwords, tokens, invite links and secret settings are stored as `[REDACTED]`.
- **New page: SysAdmin → Audit trail** (`/sysadmin/audit`), filterable by action, target, person and date. The Dashboard's Audit link, which led nowhere, now opens it.
- A route that changes data can no longer ship without being recorded: the build fails if one is missing from the list.
- Records are filed under the System Administrator's own company, so customers' audit views are unchanged.

#### SPEC-146 — Security: compliance and audit routes locked to the right role (Oct 25, app 1.5.351)

- **Fixed: any signed-in user could change the shared compliance rules.** Deleting, re-extracting or uploading the framework rule documents (SOC2, HIPAA, HITRUST, GDPR, NIST SSDF, ISO 27001), which every customer's compliance checks read, now needs a System Administrator. Nothing had been misused; the rows were all platform-owned.
- **Fixed: wxKanban's own self-audit, its results and its reports were open to every login.** Running, listing, downloading and approving them is now System Administrator only. Customers keep reading the framework rules and their compliance tasks; wxKanban's internal documents are no longer listed to them.
- **Fixed: another company's ADMIN could change a project's compliance frameworks** by naming its id. A project's settings now answer only to its own company (a consulting company with an engagement can read them, not change them).
- **Fixed: re-extracting a rule document duplicated its tasks.** It now replaces them, and refuses an extraction that finds none rather than emptying a framework.
- **Fixed: document search never ran** (another route was registered ahead of it).
- The Compliance tab no longer shows customers the Audit and Reports tabs or the Upload, Extract and Delete buttons. Every refusal is logged and every System Administrator change is recorded in the audit log.
- Verified on production: all 22 routes refuse anonymous callers, every role gets the expected answer, and the rules library is unchanged (565 tasks).

#### SPEC-037 — Consultants: assignment fix and "All projects" (Amendment A, Oct 25)

- **Fixed: a second whole-project assignment was refused.** Adding a whole project to an engagement that already had any active assignment failed with "An active assignment with these identifiers already exists", naming a different project. The duplicate check now matches the full project + scope + task, as the spec always required (FR-030).
- **New: "All projects" checkbox** on the Add assignment dialog's Whole project tab. One click grants the consulting company a whole-project assignment on every **active** project the client owns now, skipping ones it already has, and reports "N added; M already assigned". It is a one-time add, not a standing grant: projects created later are added the usual way (FR-031). One notification goes to the consulting company for the whole batch, and each row is audited to both companies.
- **Fixed: whole-project assignments were labelled "task"** on the engagement page (and "task undefined…" in the sub-assignment list). They now read "whole project" (T082).
- Verified live on production (HAS Enterprises → Wxperts LLC: 29 added, 1 skipped, re-run added nothing).

#### SPEC-044 — wxConversion Stage 3: schema parser keeps every source row (Amendment FR-011, Oct 25) — built, ships with the next kit release

- **Contributed fix from a customer (ShopMaster, feedback `2634b849`).** The schema step (`pcsoft-schema-to-sql.py`) now reads Array, JSON and UUID fields as their own records (array dimension, element type, width and format kept) instead of letting them swallow the field beside it, which had silently corrupted 79 records in their 303-table export. Every field keeps where it came from (source line, PDF pages, printed name). Anything unresolved, including cut-off or repeated column names, stops the run with exit 3 and a full list in `_unmapped-types.json`, rather than producing a schema with quiet gaps.
- **`--type-map` now answers Array, JSON and UUID too**, by exact label (`"Array of 7 Time (hhmm)=text"`) or for a whole family (`"Array=text"`), so a project with array fields can finish Stage 3 once the developer has chosen a target.
- **The refusal says what to do next again**: each unmapped type with a ready-to-paste `--type-map` line, the valid keys, and where to correct name problems.
- Composite keys whose names the PDF cut to the same text no longer block (their indexes are named from their columns).
- Fixed a regression found while applying the patch: a stray `#` line that is not a composite key swallowed the next real field.
- All three copies of the skill updated together; 241 skill tests pass.

#### SPEC-145 — Remote auto-start (Oct 25)

- **"Allow remote" switch** per project on the Kit tab (company ADMIN, or the project's TEAM_MANAGER). Off by default; the server refuses a remote start when it is off (`remote_not_allowed`), and every change is audited.
- **The Cockpit starts the project's remote on open** where it is allowed, shows Starting → Live with one notification, and reports a refusal or failure with its reason on the status bar, no pop-ups. Stop now ends the whole process tree on Windows.
- Kit: the bridge prints a ready line only once it is really connected, a fixed refusal line, and stops cleanly.

#### SPEC-144 — Company YappChatt account (Oct 24)

- Each company gets its own YappChatt account and group; project rooms are owned by it, and only Room Approvers' answers count as decisions.
- **Security: the chat login now needs the project's kit token** and refuses an email outside the company (closes a hole where any email got a session). Membership syncs automatically when users or consulting engagements change.
- Team chat panel in the Cockpit.

#### SPEC-142 / SPEC-143 — Decision Memory and agent model routing (Oct 23–24)

- **Decision ledger + Ask Gate:** owner-approved decisions are kept in an append-only ledger and answer repeat questions before they reach a person; `/wxLedger` to check, search and import.
- **KAIN may answer a parked question for the owner** in a project-agent room; the owner reviews each answer (Amendment A).
- **Agent model routing:** every spawned subagent gets a model from its task's difficulty class instead of always the most expensive one, with per-run usage capture and reports.

#### SPEC-136 — G.O.D. (`/wxG-O-D`) (Oct 18–24)

- Brainstorms are run by the wxBrainstorm panel; plan mode asks which topics to brainstorm after the review instead of mid-review.
- **Seamless `--create`:** after the design is approved, the run no longer stops for questions: low-risk ones become logged assumptions, high-risk ones park only their own unit, and all are reviewed together at the end (Amendment A).
- Offers one fresh start (`/clear` then `--resume`) before the build, to keep long runs lean (Amendment C).

#### SPEC-141 — wxKanban Manual (Oct 18)

- **The Manual v1** — one guide for the web app, the Dev Cockpit, the scope-to-release process and every command — published at `/manual`, with a generated Command Reference. Two cold read-throughs fixed every blocker found; the Cockpit opens it directly.

#### Other

- SPEC-137 Change Impact Amendment B and SPEC-140 nightly full test run (Oct 18).
- SPEC-127: test-adapter resolution now reports every application type a project declares (a Web + Mobile project's Mobile half was silently ignored) (Oct 24).

#### Still to add before the final release

- _(kit write-safety batch: SCOPE-124 Amendment C, SCOPE-135 Amendment B, SCOPE-019 Amendment B — specified, not built)_
