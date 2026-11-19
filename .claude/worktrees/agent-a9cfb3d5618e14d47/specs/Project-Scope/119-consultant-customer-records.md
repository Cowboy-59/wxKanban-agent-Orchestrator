# Spec 119: Consultant Customer Records

**Spec Number**: 119
**Status**: `draft`
**Created**: 2026-07-31
**Depends On**: SCOPE-017 (Consultant Dashboard), SCOPE-037 (Consultants Management — Engagement Core), SCOPE-005 (Time and Billing), SCOPE-117 (Production Schema Integrity)
**Blocks**: SCOPE-017 Phase 1 (its four connection tables all reference `customers`)
**Source**: `specs/Project-Scope/119-consultant-customer-records.md`

---

## Overview

A consultant needs somewhere to record who they are working for. Today wxKanban answers that only for clients who are themselves wxKanban tenants: SCOPE-037's **Engagement** links a Client Company to a Consulting Company, with invitations, assignments and tenant-scoped access control. That model is correct and shipped — but it cannot represent the client who has never heard of wxKanban, which for an independent consultant is most of them.

This scope introduces the **Customer**: a lightweight, consultant-owned record of a client — name, company, contact details, billing address, tax ID. It is a CRM row, not a tenant. It carries no login, no seat, and no access to anything.

Where the client *is* also a wxKanban tenant, the Customer record **optionally links to that company**. That link is the point of the design: wxKanban gets one answer to "who does this consultant work for" that degrades gracefully. A tenant client is a Customer with engagements behind it; a non-tenant client is a Customer with nothing behind it. Neither is a rival model — SCOPE-037 keeps sole ownership of access control, and the Customer never grants anything.

**The business problem.** SCOPE-017 specified a customer panel and external PM connections, then declared `customers` as existing infrastructure. It did not exist, and the omission blocked the entire connection layer — four tables all hang off `REFERENCES customers(id)`. The Consultant Dashboard shipped on 2026-07-31 without its customer rail and connections tile because of it. Until a Customer exists, a consultant cannot group work by client, cannot attach a client's Jira or Monday credentials to anything, and cannot produce a per-client billing view.

**What this is not.** Not a CRM with pipelines, deals or activity history. Not a replacement for Engagement. It does not grant a customer access to anything.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Consultant (TEAM role) — owns their own Customer records |
| **Secondary Actors** | Company Admin (read-only, for billing and audit) |
| **Explicit Non-Actor** | The Customer. No login, no seat, no invitation, no visibility. |
| **Key Value** | A consultant can name their clients, group projects and connections under them, and bill against them — whether or not those clients ever create a wxKanban account |
| **Scope Boundary** | IN: Customer CRUD, soft archive, optional tenant link, read-only engagement display, project-to-customer association, ownership transfer for offboarding, restoration of the dashboard Customers rail, the `customers` table SPEC-017 needs. OUT: **per-customer billing rollup (SCOPE-005 owns rate and rounding logic)**, pipelines/deals/activity history, customer-facing portals, anything granting access, invoicing itself, bulk import, de-duplication, and the external PM connection layer (stays in SPEC-017) |

### The boundary that matters

This scope adds a **record**, not a **relationship**. The moment a Customer starts conferring permissions, it has become a bad copy of Engagement and the two models will diverge. Any future requirement that a Customer grant, restrict or scope access belongs in SCOPE-037.

---

## User Scenarios & Testing

### US1 — Recording a non-tenant client

**Actor**: Consultant

1. Consultant opens Customers and clicks Add customer
2. Enters name, company, email, billing address, tax ID
3. Saves; the customer appears in the list
4. Consultant assigns an existing project to that customer
5. The Consultant Dashboard's Customers rail now shows the customer with a project count

**Expected outcome**: complete in under 60 seconds with no Engagement involved and no wxKanban account for the client.

---

### US2 — Linking a client who is also a tenant

**Actor**: Consultant

1. Consultant opens an existing Customer
2. Links it to a wxKanban company they already have an Engagement with
3. The detail view shows every engagement between the two companies, most recent first, read-only
4. Consultant confirms no new permissions were granted by the link

**Expected outcome**: the engagement history is visible and accurate; the link grants nothing.

---

### US3 — Archiving a client whose work is finished

**Actor**: Consultant

1. Consultant archives a Customer with projects, time entries and invoices against it
2. The customer disappears from the default list
3. Existing projects, time entries and invoices still resolve the customer name
4. Consultant creates a new Customer reusing the archived name — permitted
5. Consultant restores the archived customer

**Expected outcome**: nothing is destroyed; history stays intact; names are reusable while archived.

---

### US4 — Isolation between consultants

**Actor**: Consultant B

1. Consultant B lists customers and sees only their own
2. Consultant B requests Consultant A's customer by ID directly
3. The request is refused server-side

**Expected outcome**: no cross-consultant read, write or enumeration through any endpoint.

**Edge cases**:
- Company Admin reads any customer in their company but cannot write
- A client company deleted from wxKanban leaves the Customer intact and unlinked
- Two consultants in one company may each have a customer of the same name (Clarification 8)
- A consultant who still owns live customers cannot be deleted; the error names the count and points at the FR-011 transfer action

---

## Functional Requirements

### FR-001 — Customer CRUD

A consultant MUST be able to create, read and update their own Customer records.

**Acceptance Criteria**:
- [ ] Create captures name (required), company, email, phone, billing address, tax ID
- [ ] Name is required; unique per consultant among non-archived rows
- [ ] Email validated for format when present
- [ ] Records stamped with creating consultant and their company
- [ ] Update preserves `createdat` and owner — ownership changes only through the FR-011 transfer flow, never through a normal edit

---

### FR-002 — Customer list

The system MUST show a consultant every Customer they own.

**Acceptance Criteria**:
- [ ] Sorted by name; searchable by name and company
- [ ] Shows project count and, where linked, engagement state
- [ ] Archived customers hidden by default, revealed by explicit filter

---

### FR-003 — Soft archive, never hard delete

Customers MUST be archivable but MUST NOT be destroyed.

**Acceptance Criteria**:
- [ ] Archive sets `archivedat`; row and all references survive
- [ ] An archived Customer cannot be assigned to new Projects
- [ ] Existing Projects, time entries and invoices keep resolving
- [ ] Archive is reversible
- [ ] No DELETE endpoint exists

---

### FR-004 — Optional tenant link

A Customer MAY be linked to a wxKanban Company via nullable `clientcompanyid`.

**Acceptance Criteria**:
- [ ] Null is the normal case
- [ ] When set, references a real company
- [ ] Setting it grants **nothing**
- [ ] A consultant may only link to a company they already have an Engagement with, so the field cannot enumerate existing companies
- [ ] **Linking and unlinking** may both be done by the owner OR a Company Admin
- [ ] The engagement check is **company-scoped**, so an Admin is bound by the same constraint as the owner
- [ ] Either action on a record the actor does not own is written to the company audit log
- [ ] Every path that sets `clientcompanyid` enforces the engagement check. There are exactly **three** — creation (owner only), link, and unlink — and it is **NOT** settable through the general update endpoint.

**Why** (decided 2026-07-31): a wrong link is a factual error in the company's records, and the Admin is the person positioned to see and correct it in either direction. Neither action grants nor revokes access — the link never conferred any. The single-write-path rule exists because two authorities over one field, with different permission rules, is how one of them quietly stops enforcing the engagement check.

---

### FR-005 — Engagement visibility

Where a Customer is linked, the system MUST display engagements between that client company and the consultant's company, read-only.

**Acceptance Criteria**:
- [ ] All engagements including ended ones, most recent first
- [ ] Shows state, start and end dates
- [ ] Read-only — every engagement action stays in SCOPE-037
- [ ] Absence of engagements shown plainly, not as an error

---

### FR-006 — Project association

A Project MAY be assigned to exactly one Customer.

**Acceptance Criteria**:
- [ ] Nullable `customerid` on `companyprojects`
- [ ] Assignable and reassignable by the project owner
- [ ] Reassignment does not rewrite historical time entries
- [ ] Unassigned projects remain fully functional

**Rationale for one-to-many**: a time entry rolls up to a project; if that project had two customers, nothing could say which to invoice. One owner per project keeps the money unambiguous. A genuine shared engagement is two projects.

---

### FR-007 — Access control

Customer records MUST be visible only to their owner and to Company Admins.

**Acceptance Criteria**:
- [ ] Owner: full read/write/archive
- [ ] Company Admin (same company): read, plus exactly two corrective write areas — ownership transfer (FR-011) and managing the tenant link, both directions (FR-004). No create, no edit of detail, no archive.
- [ ] Every other user: no visibility, including other consultants in the same company
- [ ] Enforced server-side on every endpoint, not by hiding UI
- [ ] Ownership checked against the record, never inferred from the request

---

### FR-008 — Restore the Consultant Dashboard's Customers rail

The dashboard MUST show the customer panel the approved design specifies.

**Acceptance Criteria**:
- [ ] Customer name, project count, and (once SPEC-017's connection layer lands) connection health
- [ ] "Add customer" entry point
- [ ] Reinstates the 7/5 split from `specs/017-consultant-dashboard/page.md`, replacing the full-width projects panel shipped in path (c)

---

### FR-009 — Unblock the SPEC-017 connection layer

This scope MUST provide the `customers` table that SPEC-017's four tables reference.

**Acceptance Criteria**:
- [ ] `customerid` FKs in `externalconnections` resolve against this table
- [ ] SPEC-017 Gate 5 is cleared
- [ ] The connection tables themselves stay in SPEC-017 and are not built here

---

### FR-010 — Manual schema application

All DDL MUST follow SCOPE-117.

**Acceptance Criteria**:
- [ ] Reviewed SQL applied by hand; `drizzle-kit push` prohibited
- [ ] Verified with `npm run db:drift`
- [ ] Recorded in `specs/117-production-schema-integrity/schema-change-log.md`
- [ ] Naming: lowercase, concatenated, no underscores
- [ ] UUID v7 generated app-side via `$defaultFn(() => uuidv7())`

---

### FR-011 — Ownership transfer on offboarding

Customer ownership MUST be transferable, because `ON DELETE RESTRICT` makes offboarding a departing consultant impossible until their customers are reassigned.

**Acceptance Criteria**:
- [ ] A Company Admin can transfer every Customer owned by one consultant to another consultant in the same company, in one action
- [ ] Individual customers can also be transferred singly
- [ ] Transfer moves `consultantid` only; `companyid`, `clientcompanyid` and all other fields are unchanged
- [ ] Projects associated with a transferred Customer keep their association — the customer moved, the work did not
- [ ] Historical time entries and invoices are **not** rewritten; they reference the project, which is unaffected
- [ ] Transfer is written to the company audit log with old owner, new owner, count and actor
- [ ] Attempting to delete a consultant who still owns live customers fails with a message naming the count and pointing at the transfer action — not a raw foreign-key error
- [ ] Only a Company Admin can transfer; a consultant cannot push their own customers onto a colleague

**Why this exists.** `ON DELETE CASCADE` — the SPEC-017 default — would have let deleting a departing consultant destroy their customer records, and with them the resolvability of every invoice referencing those clients. `RESTRICT` prevents the loss but converts it into a blocked offboarding, which is only acceptable if there is a way out. This FR is that way out.

---

## Data Requirements

### Table: `customers`

**Location**: `src/db/schema/customer.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | UUID v7, app-side |
| `consultantid` | uuid NOT NULL | → `userprofiles.id` — the owner |
| `companyid` | uuid NOT NULL | → `companies.id` — tenant scoping |
| `clientcompanyid` | uuid NULL | → `companies.id` ON DELETE SET NULL — the optional link (FR-004) |
| `name` | varchar(255) NOT NULL | |
| `company` | varchar(255) | |
| `email` | varchar(255) | |
| `phone` | varchar(50) | |
| `billingaddress` | text | |
| `taxid` | varchar(100) | |
| `archivedat` | timestamp NULL | non-null = archived |
| `createdat` | timestamp NOT NULL | |
| `updatedat` | timestamp NOT NULL | |

`ON DELETE SET NULL` on `clientcompanyid` is deliberate: if the client tenant is deleted, the consultant's own record survives as an ordinary unlinked customer. Cascading there would destroy the consultant's data because of something that happened in someone else's account.

### Change to `companyprojects`

One nullable column: `customerid uuid NULL → customers.id ON DELETE SET NULL` (FR-006). Every existing project keeps working untouched.

### Reviewed DDL — apply BY HAND (SCOPE-117)

```sql
-- SCOPE-119 Consultant Customer Records. Apply BY HAND. Never drizzle-kit push.
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  consultantid UUID NOT NULL REFERENCES userprofiles(id) ON DELETE RESTRICT,
  companyid UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  clientcompanyid UUID REFERENCES companies(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  billingaddress TEXT,
  taxid VARCHAR(100),
  archivedat TIMESTAMP,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_consultantid    ON customers(consultantid);
CREATE INDEX idx_customers_companyid       ON customers(companyid);
CREATE INDEX idx_customers_clientcompanyid ON customers(clientcompanyid);
CREATE UNIQUE INDEX idx_customers_consultant_name_live
  ON customers (consultantid, lower(name)) WHERE archivedat IS NULL;

ALTER TABLE companyprojects
  ADD COLUMN customerid UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_companyprojects_customerid ON companyprojects(customerid);
```

`id` has no SQL default on purpose — the application supplies a v7 UUID, matching the nine tables that already do this. A `gen_random_uuid()` default would silently produce v4 rows on any insert outside the app.

`consultantid` uses **ON DELETE RESTRICT**, not CASCADE (Clarification 6). CASCADE would let a departing consultant's deletion destroy billing history. RESTRICT converts that silent loss into a blocked offboarding, which FR-011's transfer flow exists to unblock.

The partial unique index is partial on purpose: archiving a customer frees the name for reuse rather than blocking it forever.

### Apply order — reversing this causes production 500s

The `ALTER TABLE companyprojects ADD COLUMN` is the mirror image of the known `DROP COLUMN` hazard. Drizzle emits every declared column in its `SELECT` list, so:

**DDL first, code second.** Apply the SQL to production, verify with `npm run db:drift`, and only then declare `customerid` in `src/db/schema/companyproject.ts` and deploy. If the Drizzle declaration ships first, every query touching `companyprojects` — dashboard, Work Hub, project list — fails with `42703 column does not exist` until the DDL catches up.

Creating `customers` itself is safe in either order, since nothing selects from a table it does not yet declare.

---

## API Routes

These reuse the paths SPEC-017 already specified, so nothing is renamed. **This scope implements the customer endpoints; SPEC-017 keeps the connection endpoints.**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/consultant/customers` | List owned customers. `?includearchived=true`. Returns project count and engagement state per row. |
| POST | `/api/consultant/customers` | Create. Validates name required, unique among live rows, email format. |
| GET | `/api/consultant/customers/:id` | Detail — record, projects, engagements where linked. |
| PATCH | `/api/consultant/customers/:id` | Update. Owner only. `consultantid`/`companyid` not writable. |
| POST | `/api/consultant/customers/:id/archive` | Soft archive (FR-003). |
| POST | `/api/consultant/customers/:id/restore` | Reverse an archive. |
| PATCH | `/api/projects/:id` | Extended to accept `customerid` (FR-006) — an addition to the existing route. |
| POST | `/api/consultant/customers/:id/link` | Set the tenant link (FR-004). Owner **or** Company Admin; company-scoped engagement check; audit-logged when the actor is not the owner. |
| POST | `/api/consultant/customers/:id/unlink` | Clear the tenant link (FR-004). Owner **or** Company Admin; audit-logged when the actor is not the owner. |
| POST | `/api/consultant/customers/:id/transfer` | Transfer one customer to another consultant (FR-011). Company Admin only. |
| POST | `/api/consultant/customers/transfer-all` | Bulk transfer every customer from one consultant to another (FR-011), for offboarding. Company Admin only. |

There is deliberately **no** `DELETE /api/consultant/customers/:id`. Offering the verb invites someone to implement it, and FR-003 forbids destruction because time entries and invoices reference these rows.

---

## Frontend Components

**New — `/dashboard/consultant/customers`.** List with search by name and company, an archived filter, and a create action. Selecting a customer opens its detail: the editable record, its projects, and read-only engagement history. This is where SPEC-017's connection manager will eventually mount.

**Modified — the Consultant Dashboard.** The Customers rail returns; layout reverts from path (c)'s full-width projects panel to the 7/5 split in `page.md`. The Connections tile stays absent until SPEC-017's connection layer exists — it has nothing to count yet.

**Modified — project settings.** A customer selector, optional, defaulting to none.

### Design gate

The customer list and detail screens **were designed 2026-07-31** — `specs/119-consultant-customer-records/page.md`, status `designed — not implemented`. Master-detail on one route, drawn against the shipped API rather than against guesses. T011 is complete.

**Still undesigned, and named as separate passes in that design:** the create/edit form (including the client-company picker for FR-004) and the transfer dialog behind *Transfer owner* (FR-011, with its bulk offboarding path). Run `wxDesigner 119` for either before implementing it — the same sequence that caught the four-tile/rail problem on SCOPE-017 before it was built rather than after.

### i18n

All strings under a `customers.*` namespace in `en-US.ts`, per SCOPE-052. No bare literals; `lint:i18n` must pass.

---

## Success Criteria

1. **Unblocks SPEC-017.** Gate 5 in `specs/017-consultant-dashboard/plan.md` is cleared: the Phase 1 DDL runs with no foreign-key failure, and `npm run db:drift` exits 0 with all five tables present.
2. **No regression.** After `customerid` is added to `companyprojects`, the Consultant Dashboard, Work Hub, project list and time tracking all continue to function with **zero `42703` errors** in production logs across the 24 hours following deploy.
3. **Under 60 seconds** for a consultant to record a non-tenant client, assign a project, and see the grouping on the dashboard — with no Engagement involved.
4. **Isolation holds.** A consultant cannot read, write or enumerate another consultant's customers through any endpoint. Verified by test, not inspection.
5. **The link confers nothing.** Setting `clientcompanyid` grants no additional access to that company's data. Verified by test.
6. **Archive preserves history.** Archiving a customer with projects, time entries and invoices leaves every one resolvable.

---

## Constraints

- MUST NOT grant access. Any permission implication belongs to SCOPE-037.
- MUST apply DDL manually per SCOPE-117; `drizzle-kit push` prohibited; recorded in the schema change log.
- MUST apply the `companyprojects` DDL **before** deploying the Drizzle declaration.
- MUST use UUID v7 generated app-side.
- MUST follow the naming convention — lowercase, concatenated, no underscores.
- MUST enforce authorization server-side on every endpoint.
- MUST NOT hard-delete a customer.
- MUST route all code through the orchestrator with fences using `Tnnn` task IDs — the fence grammar is `(T\d+)` and cannot express any other form.
- `tasks.md` MUST carry a markdown task table; the task index at `wxkanban-agent/core/orchestrator/task-id-index.ts` reads only lines beginning with `|` or `###` and ignores checkbox rows.

---

## Open Questions

**None. All four were decided on 2026-07-31** — see Clarifications below.

---

## Notes

- SCOPE-037's engagement model is **shipped**: `engagement.ts` with `clientcompanyid`/`consultingcompanyid`, plus `engagementassignment`, `engagementinvitation`, `engagementmodification`, and a live `/api/engagements` route. This scope was deliberately designed not to compete with it.
- The user FK target is `userprofiles.id`, **not** `users.id`. SPEC-017's DDL used `users(id)`, which does not exist and would have failed on application.
- SPEC-017 originally declared `customers` under "Existing Infrastructure" in its plan. It did not exist. That false assertion has been corrected in `specs/017-consultant-dashboard/plan.md`.

---

## Clarifications

### Session 2026-07-31

| # | Question | Decision |
|---|----------|----------|
| 1 | Extend Engagement, standalone table, or hybrid? | Hybrid — a lightweight consultant-owned Customer with an optional link to a tenant company |
| 2 | Link to an Engagement or to a Company? | To the **Company** (`clientcompanyid`). Engagements are then discoverable through the existing table, history comes free, and there is no "which engagement" ambiguity |
| 3 | What happens to a Customer when an Engagement ends? | Nothing. The Customer is the consultant's own record; ending a contract does not delete an address book entry |
| 4 | Project-to-customer cardinality? | One-to-many. Many-to-many makes invoicing ambiguous |
| 5 | Customer screen — new page or dashboard panel? | New page at `/dashboard/consultant/customers`. The record carries too much content for a panel, and will carry more once connections land |
| 6 | **Offboarding** — what happens to a departing consultant's customers? | **`ON DELETE RESTRICT` plus an explicit transfer flow (FR-011).** Deleting a consultant who still owns customers fails loudly until they are reassigned. Nothing is ever silently destroyed. CASCADE was rejected: it would make billing history for departed staff unresolvable |
| 7 | **Per-customer billing rollup** — here or SCOPE-005? | **SCOPE-005.** This scope provides only the grouping key (`companyprojects.customerid`). Keeping rate and rounding logic in one scope is what stops the two from drifting apart |
| 8 | **Name uniqueness** — per consultant or per company? | **Per consultant**, matching the ownership model. Per-company uniqueness would error on a name because of a row the consultant is not permitted to see, which both confuses and leaks |
| 9 | **Cross-reference** — record the dependency in SPEC-017? | **Yes.** An explicit `Depends On: SCOPE-119` line added to `specs/017-consultant-dashboard/spec.md`, alongside the existing Gate 5 note in `plan.md` |
