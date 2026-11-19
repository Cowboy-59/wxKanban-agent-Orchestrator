# CONTEXT.md — wxKanban Domain Glossary

A living glossary of terms meaningful to domain experts. Updated inline during design sessions.
Only terms that matter to the business domain — no implementation details, no file paths.

---

## Core Entities

**Company**
A tenant organization. All Users, Projects, and billing belong to a Company. The top-level isolation boundary.

**User**
A person who logs in to wxKanban. Belongs to exactly one Company (their primary Company). Has a role within that Company (e.g. ADMIN, TEAM_MANAGER, TEAM_MEMBER). A User may also receive engagement-based visibility into work owned by *other* Companies through their primary Company's Engagements — see Consulting Member.

**Project**
A unit of work owned by a Company. Has a lifecycle phase (Design → Implementation → QA Testing → Human Testing → Beta → Release). Contains Tasks and Time Entries.

**Task**
A single unit of work inside a Project. Can originate from wxKanban directly or be synced from an external PM system. Has a status, assignee, and optional time tracking.

**Time Entry**
A recorded amount of Developer or Resource work on a scope line or a project line (Brainstorming, Processes), by a person or a model. May be billable or non-billable. A Task link is optional (SCOPE-005 Amendment A); legacy task-timer entries carry no category and are never billed on a Statement.

**Invoice**
A billing document generated from a set of billable Time Entries for a Project within a date range. Tracks hourly rate and hours worked.

**Note**
A free-text annotation attached to a Task or Project. Supports markdown.

---

## PM System Integration

**PM System**
An external project management tool: Jira, Monday.com, Asana, or Trello. Connected via OAuth2.

**PM System Connection**
A stored OAuth2 credential set (access token, refresh token — encrypted at rest) linking a Company to one external PM System instance.

**Sync**
A background polling job that fetches Tasks from the connected PM System and writes them into wxKanban. Runs every 5–15 minutes. Non-blocking on failure.

**Conflict Resolution**
When a Task exists in both wxKanban and the PM System with different values, wxKanban's version wins (last-write-wins).

---

## Lifecycle & Workflow

**Lifecycle Phase**
One of six sequential stages a Project moves through: Design, Implementation, QA Testing, Human Testing, Beta, Release. Stage gates control which commands are available at each phase.

**Scope**
A discrete unit of specification work. Each scope has a spec.md, plan.md, tasks.md, tests.md, and quickstart.md. Corresponds to a feature or requirement set.

**Stage Gate**
A policy check that blocks lifecycle advancement until required conditions are met (e.g. all tasks complete, all QA tests passed).

**Project Lifecycle Document**
A per-Project document that summarizes that project's scopes/specs by lifecycle phase, generated and updated automatically on every create and update of scopes, specs, and tasks. It is the single source of truth for lifecycle documentation (per project — there is no separate hand-maintained platform-wide aggregate) and is surfaced from the Admin Dashboard's per-project "Project Lifecycle" link.

---

## Authentication & Security

**Session**
A user's authenticated state represented by a JWT (24-hour expiry) stored in an httpOnly cookie.

**API Token**
A long-lived token used by the wxkanban-agent CLI to authenticate against the MCP server without a browser session. Scoped to a Project.

---

## Time Tracking

**Timer**
A client-side elapsed-time counter started by a User against a Task. Persists as a Time Entry on stop.

**Inactivity Prompt**
A warning shown when a Timer has been running for more than 8 hours (configurable) without a stop action.

**Billable**
A flag on a Time Entry indicating the work should be included in Invoice generation.

---

## Invoice Generation

**Hours Worked**
`SUM(timeentries.duration) / 60` for a set of filtered Time Entries.

**Hourly Rate**
A per-Project rate used to calculate invoice totals: `hoursWorked × hourlyRate`.

**Invoiced**
A flag on a Time Entry set to `true` after it has been included in a generated Invoice. Prevents double-billing.

---

## Time & Billing (SCOPE-005)

**Resource**
One AI agent doing billable work. Each subagent run counts as one Resource even on the same model, and the main session counts as one. Never called "AI" on a page or a Statement.

**Process**
Work outside the buildscope → implement pipeline, such as test plans, SOC 2 artifacts, database analysis and G.O.D. plans. Run by Resources and billed on the Processes – Resource line.

**Billed Project**
A Project ticked "Bill this project", eligible for a Statement once it has a Customer.

**Statement**
An Invoice for one Customer for one period: page 1 lists daily Senior Developer and Resource rows (hours × rate) with the total and ACH payment details; page 2 summarizes the scopes, bugs, processes and brainstorms done.

**Billing Cycle**
How often a Customer is billed: weekly by default, bi-weekly if negotiated.

---

## Consulting & Engagements

**Consulting Company**
A wxKanban tenant on the CONSULTANT plan that performs scoped work *for* other tenants. Can be solo (one member) or multi-person. Identifiable by `companies.billingplan = 'CONSULTANT'`.

**Client Company**
A wxKanban tenant that engages a Consulting Company to do scoped work on its Projects. Any tenant tier can be a Client.

**Engagement**
The Company-to-Company relationship between a Client Company and a Consulting Company. Has a lifecycle state: `active`, `paused`, `disabled`, `ended`. Owns the high-level grants of access. Multiple Projects may live under a single Engagement.

**Engagement Assignment**
A specific grant on an Engagement: either *scope-level* (the whole scope) or *task-level* (a single task within a scope). Mixed-granularity assignments per Engagement are allowed. Mutable at any time by the Client ADMIN.

**Sub-Assignment**
The Consulting Company's internal distribution of an Engagement Assignment to one or more of its own Consulting Members. Owned by the Consulting Company's ADMIN or TEAM_MANAGER. Not visible to the Client Company.

**Consulting Member**
A User whose primary Company is a Consulting Company and who receives Sub-Assignments. Consulting Members are NOT team members of the Client Company and do NOT count against its seat cap.

**B2B Invoice**
An Invoice generated by a Consulting Company against a Client Company for billable Time Entries logged under an Engagement. Delivered by email to the Client Company's billing contact email. Time Entries themselves live in the Consulting Company's tenant.

---

## Developer Tooling

**Dev Cockpit**
A read-only VS Code sidebar that shows the currently linked project's remaining work — incomplete tasks grouped by scope, with the active scope pinned — so a developer sees what's left to finish without leaving the editor. Stays live as work is built and completed, and reads through the project-scoped MCP.

**Scope Quality Gate**
The single check a scope document must pass before specs can be generated from it. Validating a scope and generating specs from it apply the same gate, so a scope that passes one passes the other.

**Needs-Clarification Marker**
A marker the scope builder leaves in a section it was given no content for. It blocks the Scope Quality Gate until the author supplies that content, or states explicitly that the section does not apply ("None").

**Boilerplate Requirement**
A generic functional requirement that fits any scope ever written (e.g. "Business rule enforcement"). It carries none of the author's intent, and specs generated from it silently drop the real requirements.

---

## Documentation

**Docs**
The public, logged-out documentation section reached from the landing-page "Docs"
menu. A SysAdmin-managed set of help records, each showing a multi-line summary of
what its how-to video covers, the full documentation text, and an embedded how-to
video (hosted on AWS S3, public-read). Distinct from the authenticated in-app Help
panel; shares the underlying help records but is surfaced publicly.

**Manual**
The single wxKanban user manual covering the web app, the Dev Cockpit, the scope-to-release
process and every shipped command, built from one source into two editions. Distinct from Docs
(videos and topics) and the in-app Help (short, plan-aware cards).

**Customer edition**
The public edition of the Manual, readable logged out and from inside the app; it holds only
content marked for customers, so anything unmarked is left out.

**Internal edition**
The edition of the Manual that holds everything, including drift reports and the list of commands
left out of the Customer edition; it never leaves the repository.

**Command Reference**
The part of the Manual that describes every shipped command: its purpose, its stage, what it calls
and what calls it. It is generated from the command files, never written by hand.

**Command Registry**
The single machine-readable list of commands produced with the Command Reference, from which other
surfaces read the command list instead of keeping their own.

---

## AI

**AI Provider**
The LLM used for spec generation and analysis. Primary: Gemini. Fallback: OpenAI.

---

## Bug-Trapping

**Trapped Error**
An auto-captured runtime error from an application, routed to a wxKanban project for triage. For wxKanban's own app it goes to the central sink (SCOPE-061); for a customer's app it is routed to that customer's own Project (SCOPE-063).

**Error Ingest Token**
A project-scoped bearer token authorizing an external application to post Trapped Errors to its owning Project. Bound to the Project, revocable, and shown in cleartext only once at issue. (Same token family as the API Token used by the CLI.)

---

## Localization

**Language Preference**
A per-user choice of display/content language stored on the User record, seeded from browser locale on first login and persisting across sessions and devices. Drives the app UI, public surfaces, AI-generated content, and the VS Code extension's generation language.

**Authoring Language**
The language a generated document (spec, scope, feedback) was originally written in. It is the source of truth and is never overwritten by a translation.

**Protected Methodology Terms**
The set of methodology/lifecycle terms (Scope, Stage Gate, Lifecycle Phase, the six phase names, Spec) deliberately kept in English across every language so learners acquire the industry vocabulary the kit teaches. Applies to both UI chrome and AI-generated content.

**On-Demand Review Translation**
A view-time translation shown when a reviewer's Language Preference differs from a document's Authoring Language. Non-destructive — the stored original is preserved. Distinct from the banned general-purpose UI machine-translation engine.

**Localization Platform**
The framework that makes every user-facing surface translatable with a guaranteed en-US fallback. v1 ships the machinery with en-US authored only; non-English UI strings fall back to English until authored, while AI-generated content is multilingual immediately.

## Stack & Style

**Stack & Style Preferences**
A per-project record of the target technology stack and design/CSS style, captured via the guided `/buildstack` interview and persisted as the project's `stack.md` document. The kit injects it into generated scopes, specs, and code so output matches the project's real stack and look (the same command-template injection used by the Localization Platform).

**Application Type**
Whether a project is a Web, Desktop, or Mobile application. Chosen first in `/buildstack`; it drives the recommended default stack.

**Company-Wide Stack Profile**
A company-level default Stack & Style Preferences set, one per Application Type (up to three per Company). Set by an ADMIN. It is the live default for any project that has not set its own `stack.md`; a project always overrides by having its own. Company-scoped and tenant-isolated.

**Design Tokens**
The concrete visual values of a project's style — color palette, typography, and spacing/radius — derived from a Look-and-Feel Reference and recorded in `stack.md`.

**Look-and-Feel Reference**
A design direction a user picks by example rather than by design vocabulary — chosen from a curated set of inspiration galleries (Mobbin, Land-book, Dribbble, Awwwards) and/or a cited app/page. The AI derives Design Tokens from it.

**Website Look Source**
A live website URL a user points the Theme Studio at to faithfully borrow its **color scheme and control styling only** — never its layout, header, or footer. A headless browser captures the site's real rendered styling and the AI maps it onto the theme's semantic token set, clamped to accessible contrast and falling back to a safe default if the site can't be read. The higher-fidelity successor to a cited Look-and-Feel Reference.

**Website Page Source**
A live website URL a user points the Theme Studio at to reconstruct its **section structure** (hero, nav band, feature rows, CTA, footer) into editable Blocks styled by the active theme — the structural counterpart to a Website Look Source (which borrows color only, never layout). The page's HTML is parsed statically and the AI maps its outline and text into a Block Node tree. It is a structural rebuild into on-brand, editable Blocks, never a pixel-faithful clone of the original markup, and it falls back safely when a page cannot be parsed (for example a purely client-rendered app).

**Business Chrome**
The customer's own header and footer for their generated product — a logo, the business/app name, and a footer line — authored by the user and styled by the current theme. It is laid on top of a borrowed look and is never derived from any admired site.

**Theme Template**
A named, reusable bundle of a look (theme tokens) plus Business Chrome, stored per Company as a collection (many per Company). Any project can pick a Theme Template and inherit both its colors and its header/footer. Any member may save one; only an ADMIN may rename or delete gallery entries. Company-scoped and tenant-isolated. May also carry an ordered list of Blocks (SCOPE-107).

**Block**
A reusable, drag-drop-composed branded **section** (hero band, CTA, feature row, form, card grid) — a structured layout tree styled by the active theme, that lives *between* the header and footer (the body counterpart to Business Chrome). Saved to the Block Library, dropped into a Theme Template, and executed to real React+Tailwind+shadcn component code. Sections, not pages; laid out by auto-reflow (stack/grid), never pixel-positioned; its data is static placeholder content, not a live source.

**Block Node**
A single element in a Block's tree — a typed node (heading, paragraph, image, button, input, card grid, stat tiles, panel, …) with editable static-content properties and, for containers, child nodes.

**Block Library**
A Company-scoped collection of named Blocks. Many per Company; any member may save, only an ADMIN may rename or delete; tenant-isolated (the reuse/governance twin of the Theme Template gallery).

**Node-Type Registry**
The single source of truth defining, per Block Node type, its default properties, its editable-property descriptors, its live (canvas/preview) rendering, and its generated-code emission — so the canvas, the preview, and the executed code never drift.

**Stack Adapter**
A per-stack module supplying the concrete machinery the stack-neutral test pipeline needs to execute on one technology stack: its inventory source, schema source, test harness, UI driver, database posture, and test substitutes. Authored by wxperts, hand-written by a customer, or generated from the project's Stack & Style Preferences when no adapter matches. A user-added adapter is provisional until approved; a wxperts-shipped one never is.

**Database Posture**
A Stack Adapter's answer for how a disposable, non-production database target is created and bounded on its stack — a schema prefix, a directory, or a container. Every posture must refuse writes outside its own boundary, so "never touch production" holds even on a stack with no database server.

## FAQ

**FAQ**
A curated, global product question-and-answer about wxKanban itself, shown read-only where users already work (the User Dashboard, Project Detail, and the VS Code Cockpit). Authored or AI-drafted, then published by a SYSADMIN. Global to the product — not owned by any one Company or Project.

**Unanswered question**
A question a user has submitted that has no answer yet. It waits in the SYSADMIN's queue and is not visible to users until a SYSADMIN answers and publishes it, at which point it becomes a FAQ.

---

## Archiving

**Archived (scope status)**
A non-destructive lifecycle status that retires a scope/spec group from every working surface (the cockpit, lifecycle, devplan, scopeflow, and project panel) and moves its on-disk files to an archive folder, while preserving all data and the prior status so it can be restored. The reversible counterpart of deleting a scope; any project member can archive or unarchive. Applies to scopes and specs only — the equivalent action on a feedback submission is DISMISSED, deliberately named differently so the two never collide.

---

## Feedback Queue

**Dismissed (feedback)**
A reversible administrator-side hide that removes a feedback submission from the working triage queue and from all feedback metrics, while leaving its status, disposition, and full triage history intact. The counterpart of PURGED; distinct from ARCHIVED, which applies to scopes and specs.

**Hidden (feedback)**
A submitter-side hide that removes a submission from that submitter's own feedback list. Independent of DISMISSED — hiding has no effect on what an administrator sees, and dismissing has no effect on what the submitter sees.

**Purged (feedback)**
Permanent deletion of a feedback submission. An audit entry carrying a full snapshot of the record is written before the deletion, so the content survives even though the record does not. Irreversible through the product.

**Error Identity**
What makes two captured runtime errors the same error: the error class, the point at which it was trapped, its normalised message, and the leading frames of its stack. Deliberately excludes the browser route the user was on, which describes where an error was noticed rather than what it is. One error identity is one record per project.

**Reopened (feedback)**
The transition of a closed error record back to open because the same error occurred again. Records the occurrence against the existing report rather than creating a new one, and notifies once per reopening — the product's signal that a fix has regressed.

---

## Remote Sessions

**Remote Session Bridge**
A local, per-project process that relays a live Claude coding session to and from that project's private chat room, so the operator can monitor and drive it (answer, steer, start, stop, cancel) from another device such as a phone. Started by the Cockpit or by `npm run remote`, never by a spoken phrase (`GO REMOTE` is retired); runs in bypass so it never freezes on prompts, with push as the sole human-gated action.

**Handoff**
A short status summary of the work in progress (scope and task, done, in flight, blocked, uncommitted work, next step) that the operator's session posts to the repo's Project Session Room, starting with `[HANDOFF]`, so whoever listens there knows where the work stands. Posted by saying `HANDOFF REMOTE`; it launches nothing. It is addressed to the Project Agent, the Claude session the bridge runs in project-agent mode: the agent reads it as context, does not carry out its "next step", and opens the discussion with the operator in the room.

**Project Session Room**
A YappChatt room bound to a single Project — one room per project, so concurrent Remote Session Bridges across projects are each monitored and driven separately. Owned by the Company YappChatt Account and shared by the Company's Users plus the Consulting Members on that project; who may decide in it is limited to Room Approvers.

**Company YappChatt Account**
The one YappChatt account a Company owns, made from the Company's contact email (or linked, when that email already has one). It owns the Company's group and every Project Session Room.

**YappChatt Manager**
A Company ADMIN, acting for the Company YappChatt Account: invites people to its common (non-project) rooms.

**Room Approver**
A person whose answer in a Project Session Room counts as a decision: a Company ADMIN, or a TEAM_MANAGER on that Project.

---

## Legacy Conversion

**Conversion Artifact**
Any file a conversion produces from a legacy application's source or generated documentation. Distinct from configuration in that it is committed deliberately as rebuild source material and read routinely thereafter — which is why it must be treated as capable of carrying credentials, not as inert documentation.

**Credential Redaction**
Replacing a hardcoded credential's value in a conversion artifact while preserving the record that a credential was hardcoded, and where. The finding is retained because it is required output for both the rebuild and the rotation that must follow; only the value is removed.

**Redaction Token**
The placeholder that stands in for a redacted credential value. Stable across a whole conversion run, so one credential reused across many procedures reads as one credential rather than many — a distinction the migration depends on.

**Redaction Sidecar**
The per-conversion record listing every credential finding by token, artifact, line, and the key that matched. Never contains a value in any form, including truncated or masked. It is the detection signal whose absence is the defect it exists to close.

**Exposure Scan**
A read-only pass over conversion artifacts that have already been produced, reporting credential literals present in them without modifying anything. Distinguishes discovering past exposure from preventing future exposure — the first cannot be remedied by redaction, only by rotation.

**Security Baseline**
The deny-rule set the kit writes at install and upgrade, restricting what an AI client may read (env files, key material, credential-bearing config). Its manifest — the init report proving each rule held — is the per-project activation key for server-side sovereignty features.

**Posture Evaluation**
Verification of the real project rather than its documents: baseline present and holding, no secrets in tracked files, rotation runbook current, endpoint configuration intact. One engine, three triggers: kit install, kit upgrade, on demand. Distinct from document compliance, which a project can pass while failing posture.

**Tenant AI Endpoint**
A tenant's chosen destination for server-side inference and embeddings, replacing the global provider for that tenant only. Resolution order is per-tenant, then environment, then preset; a path that cannot honor it abstains rather than falling back to a global provider.

**Destination Evidence**
The per-call record of where each server-side AI request was actually sent, produced at the single resolution seam and rendered into audit artifacts. Exists because a data-sovereignty claim without a destination record is an assertion, not evidence.

**Blast-Radius Tier**
Classification of a secret by the consequence of rotating it: from freely rotatable, through restart-required and user-visible, to DO-NOT-ROTATE — reserved for keys whose rotation destroys data rather than merely invalidating it.

**Change Impact**
The set of code, scopes, shared tables, and human test sign-offs that a proposed or completed change reaches, each link labeled with its confidence. Shown at the moment of change, in development edits, scope generation, and brainstorms. Not to be confused with Blast-Radius Tier, which classifies secrets.

**Impact Boundary**
A Change Impact crossing that requires agreement rather than notification: the change reaches another scope's code, touches a shared table (written by one scope and read or written by another), or would undo a human test sign-off.

**Teaching Skill**
An AI-agnostic markdown lesson, generated from a walk of an app's real screens (or, for desktop and mobile apps, from their screen definitions), that teaches one process step by step. It holds behavior only, never data, and carries its own version and the app version it describes.

**Committing Step**
A step in a process that saves, submits, sends, or deletes. In Production a Teaching Skill asks "Do you wish to save your changes?" before it; in UAT the learner may proceed freely.

**Onboarding Video**
A short, branded video of one process, generated by replaying that process's Teaching Skill steps in UAT and recording them; paired with that lesson at the same version, and never recorded in Production.

**Nightly Run**
An unattended, scheduled run of planned tests against a non-production instance, choosing impacted items first and rotation after. The only source of pass/fail results in overnight testing.

**Observation**
A finding from exploration or the usability pass that needs a human look. Never a pass or a fail; tracked until fixed or dismissed.

**Designated Agent**
The dedicated, non-human identity that Nightly Runs execute and record as, with its own credentials held only on the test server.

**Entry Path**
How a user reaches an app: direct, or through a named portal (such as Workbench or wxHub). Shared by Nightly Runs, Teaching Skills, and Onboarding Videos.

**Inert-at-Deploy Activation**
The delivery rule that server-side changes ship dormant and activate per-project only on evidence the project's kit has landed the enabling baseline. Exists because server deploys and live-fetched prompts otherwise reach every customer immediately, bypassing their upgrade decision.

---

## Conventions

- All domain terms in code should match the names in this glossary exactly (case-insensitive for DB columns, PascalCase for TypeScript types).
- When a new term is agreed during a design session, add it here immediately — don't batch.
- Never include implementation details (file paths, function names, column types) in this file.

## Development Process Management

**wxG-O-D (G.O.D.)**
The Guru of Development: the kit command that manages a project's development process. In plan mode it turns evidence into a signed-off development plan; in new-project mode, and with `--create`, it designs the project and then executes the development plan through the pipeline commands. In plan mode and new-project mode it plans and orchestrates, and never writes a scope, spec, task, or line of code itself. Under `--create`, the user's approval of the design authorizes it to complete the process: it answers the commands' gates from that design, repairs what a failing command leaves, and commits each finished unit locally, logging each. It never pushes, deploys, or signs off a human test.

**Hosted Method**
A command's methodology served at runtime by the hosted MCP (`project.get_command_prompt`) rather than shipped in the kit. The kit holds only a stub, any deterministic scripts, and the thin command. Reference documents of a hosted method are served under path keys (`<command>/references/<name>`) and fetched only when a step needs them.

**Driver and Relay**
The division of roles in an unattended run: the driver (G.O.D.) owns the plan and issues every command; the relay (KAIN) monitors, carries each question the driver asks and each action request to the developer, and carries the answer back. The relay never answers for the developer and never takes the plan over. One driver per working tree.

**Analyze sitting**
One brainstorm analyze pass over one built app or conversion: the panel's feature groups approved first, the existing analyzers run without stopping, and every merged result reviewed by the owner item by item. It never changes the app and never estimates or plans work (SCOPE-156).

**Finding**
One merged issue, gap or optional improvement from an analyze sitting, with a stable identity that lets a later sitting tell new, fixed, still-open and previously declined apart, and the owner's decision with its reason, date and who made it.

## Decision Memory

**Decision Ledger**
The append-only record of owner-approved decisions for one repo. A decision is changed only by a newer entry that supersedes it, and only the owner's approval adds one.

**Ask Gate**
The check that answers an agent's question from approved decisions before it reaches a person. It answers only from decisions the owner approved; an uncovered question is either sent to a person (a blocker) or becomes an Assumption.

**Assumption**
A default an agent chose for an uncovered, non-blocking question, logged for the owner to review at the end of the run. An assumption is never a decision.

**Global Tier**
Owner-approved general patterns that every repo can search. It holds no project's own decisions; one repo reads another's ledger only through an explicit owner link.

## Agent Model Routing and Metering

**Agent Run**
One agent's work on one task, or one main-session command turn, recorded with the model that did it, its tokens, and its active and waiting time. The unit of both cost analysis and billable time.

**Difficulty Class**
Easy, moderate or heavy, assigned to a task by a fixed rule (security, money, schema or production work is always heavy). It decides which model tier a subagent starts on.

**Tier Table**
The map from difficulty class, and from each kit command, to a model tier. It has a kit default and a project override, and only the owner changes it.

**Command Tier**
The model tier a kit command declares for its own turn in the main session. It never changes the owner's own session model choice.

**Provider Policy**
The per-project list of which kinds of work may go to an AI provider other than Anthropic. Empty by default; only the owner edits it, and no learning can widen it.

**Comparison Run**
The same task run on two model routes, with the same starting point, and reviewed by a third model, to compare cost per finished task with quality.

**Tier Proposal**
A tier-table change that G.O.D. proposes from comparison evidence. Nothing changes until the owner approves it.

**myndSynergy**
The owner's multi-project assistant ("Jarvis"), working with KAIN, that receives each project's summaries and oversees the projects together. It displays proposals but cannot approve them.

**Platform Compliance Library**
The framework rule documents (SOC2, HIPAA, HITRUST, GDPR, and others) and the compliance tasks extracted from them. Global to the product, maintained by a SYSADMIN, and read by every Company.

**Platform Self-Audit**
An audit run on the hosted server that checks wxKanban's own code against the enabled frameworks, with its results and reports. SYSADMIN only; never a customer's audit of their own code.

**Internal platform document**
A stored platform document that is not a framework rule document, such as wxKanban's database analysis, ER diagram, or test reports. Visible only to a SYSADMIN.

**SysAdmin action record**
An audit-log entry recording a change a SYSADMIN made: who, what, when, the target, and its state before and after. Filed under the acting SysAdmin's company and append-only.

**SysAdmin write registry**
The single list of every SysAdmin route that changes data and the action each records; a route missing from it fails the build.

**Triage run**
One unattended pass by the feedback-sink company's project agent over every report in My Feedback and Incoming, producing a dated triage report and a room summary; daily, on a missed day, or on the operator's TRIAGE command.

**Triage group**
A set of feedback reports judged to be the same issue, identified by its oldest report's feedback ID and ranked by severity, with a verdict on whether its fix is still broken, partial, fixed but not shipped, or shipped.

**Resolution template**
A server-owned message sent to a customer when a report is resolved because its fix shipped in an earlier release, chosen by product (kit, Cockpit, or hosted) and naming the version that carries the fix.

**K.A.I.N. sign-in**
K.A.I.N. signing in with a person's own wxKanban email and password, once per device, so it acts as that person rather than as a company.

**K.A.I.N. device token**
The credential wxKanban issues to one person's K.A.I.N. on one device at sign-in; the person or their company admin can revoke it, and a password change ends it.

**Agent reach**
The Projects a signed-in person's K.A.I.N. may work on: their own company's Projects they can reach in the web app, plus Projects assigned to their consulting company under an active engagement, always limited to Projects with Allow remote on and re-checked on every call.

**Session Feed**
The local, masked, one-line-per-turn record of the developer's session that the Project Agent summarizes; it never leaves the machine.

**Session Status**
The masked rolling summary, last entry and open blockers the Project Agent publishes for K.A.I.N.; overwritten each heartbeat and never kept as history.

**Agent Mailbox**
A Project's message queue on the wxKanban app, through which K.A.I.N. directs the Project Agent without the room.

**Directing Hold**
The right, held by one person at a time, to direct a Project's agent; it lapses 3 minutes after that person's last direction.

**Director**
The person currently holding a Project's Directing Hold.
