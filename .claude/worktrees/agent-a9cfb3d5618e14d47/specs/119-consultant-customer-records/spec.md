# Spec 119: Consultant Customer Records

## Overview

A consultant needs somewhere to record who they are working for. Today wxKanban answers that only for clients who are themselves wxKanban tenants: SCOPE-037's Engagement links a Client Company to a Consulting Company, with invitations, assignments and tenant-scoped access control. That model is correct and shipped, but it cannot represent the client who has never heard of wxKanban, which for an independent consultant is most of them.

This spec introduces the Customer: a lightweight, consultant-owned record of a client — name, company, contact details, billing address, tax ID. It is a CRM row, not a tenant. It carries no login, no seat, and no access to anything.

Where the client is also a wxKanban tenant, the Customer record optionally links to that company via a nullable clientcompanyid. A tenant client is a Customer with engagements behind it; a non-tenant client is a Customer with nothing behind it. Neither is a rival model — SCOPE-037 keeps sole ownership of access control, and the Customer never grants anything.

## Business Problem

SCOPE-017 specified a customer panel and external PM connections, then declared the customers table under "Existing Infrastructure". It did not exist. A search of all 144 files in src/db/schema returned zero matches; the only "customers" references in the codebase were unrelated Stripe customer IDs.

The omission blocked an entire feature layer. SPEC-017's four connection tables — externalconnections, credentialauditlogs, synchistory, connectionhealth — every one declares customerid REFERENCES customers(id), so none of them could be created. The Consultant Dashboard shipped on 2026-07-31 without its Customers rail and Connections tile for exactly this reason.

Until a Customer record exists, a consultant cannot group work by client, cannot attach a client's Jira or Monday credentials to anything, and cannot produce a per-client billing view. This spec supplies the missing foundation and unblocks SPEC-017 Phase 1.

## Actors

- Primary: Consultant (TEAM role) — creates, edits, archives and transfers their own Customer records, and assigns Projects to them.
- Secondary: Company Admin — reads every Customer in their company for billing and audit purposes, and performs ownership transfers when a consultant is offboarded. Cannot edit customer detail.
- Secondary: The Customer themselves is an explicit non-actor. No login, no seat, no invitation, no notification, and no visibility into anything. A client who needs to see inside wxKanban is an Engagement (SCOPE-037), not this.

## Success Metrics

- SPEC-017 Phase 1 is unblocked: its DDL runs to completion with 0 foreign-key failures, and npm run db:drift exits 0 with all 5 tables present.
- Zero regression: after customerid is added to companyprojects, the Consultant Dashboard, Work Hub, project list and time tracking produce 0 occurrences of PostgreSQL error 42703 in production logs across the 24 hours following deploy.
- A consultant records a non-tenant client end to end — create customer, assign a project, see the grouping on the dashboard — in under 60 seconds, with no Engagement involved.
- Isolation holds: 0 successful cross-consultant reads, writes or enumerations of customer records through any of the 9 endpoints, verified by automated test.
- The tenant link confers nothing: setting clientcompanyid grants 0 additional read or write permissions on that company's data, verified by automated test.
- Archive preserves history: archiving a customer with projects, time entries and invoices leaves 100% of them resolvable.

## Scope Boundary

Customer CRUD (create, read, update) owned by the consultant, capturing name, company, email, phone, billing address and tax ID. Soft archive and restore, never hard delete, because time entries and invoices reference these rows. An optional nullable clientcompanyid link to a wxKanban Company, plus a read-only display of any engagements discoverable through it. Association of Projects to a Customer, one-to-many, via a nullable customerid on companyprojects. Ownership transfer, single and bulk, so a consultant holding customer records can still be offboarded. Restoration of the Consultant Dashboard's Customers rail and the 7/5 split layout in the approved design. Provision of the customers table that SPEC-017's four connection tables reference.

## Out of Scope

Per-customer billing rollup — hours and earnings grouped by client belong to SCOPE-005 (Time and Billing), which owns rate and rounding logic; splitting that calculation across two specs is how rates and rounding rules drift apart. This spec supplies only the grouping key.

Pipelines, deals, opportunities and lead stages — this is not a sales CRM. Activity or contact history. Customer-facing portals or logins. Anything that grants, restricts or scopes access, which is SCOPE-037's alone. Invoicing itself, owned by SCOPE-005. Bulk import and de-duplication against existing companies. The external PM connection layer — externalconnections, credentialauditlogs, synchistory and connectionhealth — remains in SPEC-017, which already specifies it in full; this spec only unblocks it by giving customerid a real table to reference.

## Open Questions

None outstanding. All four questions raised during scoping were decided on 2026-07-31 and are recorded as clarifications:

Offboarding resolved to ON DELETE RESTRICT on consultantid plus an explicit transfer flow (FR-011), because CASCADE would let deleting a departing consultant destroy customer rows and make every invoice referencing those clients unresolvable.

Per-customer billing rollup assigned to SCOPE-005; this spec provides only the grouping key.

Name uniqueness scoped per consultant rather than per company, matching the ownership model, because per-company uniqueness would error on a name due to a row the consultant is not permitted to see.

The dependency was recorded as an explicit Depends On line in SPEC-017 alongside the existing Gate 5 note in its plan.

## Functional Requirements

### FR-001 — Customer CRUD

A consultant MUST be able to create, read and update their own Customer records. Create captures name (required), company, email, phone, billing address and tax ID. Name is required and unique per consultant among non-archived rows. Email is validated for format when present. Records are stamped with the creating consultant and their company. Update preserves createdat and owner; ownership changes only through the FR-011 transfer flow, never through a normal edit.

### FR-002 — Customer list

The system MUST show a consultant every Customer they own, sorted by name and searchable by name and company. Each row shows project count and, where linked, engagement state. Archived customers are hidden by default and revealed by an explicit filter.

### FR-003 — Soft archive, never hard delete

Customers MUST be archivable but MUST NOT be destroyed. Archive sets archivedat; the row and all its references survive. An archived Customer cannot be assigned to new Projects. Existing Projects, time entries and invoices keep resolving. Archive is reversible. No DELETE endpoint exists, because offering the verb invites someone to implement it.

### FR-004 — Optional tenant link

A Customer MAY be linked to a wxKanban Company via nullable clientcompanyid. Null is the normal case. When set it MUST reference a real company. Setting it grants nothing. A consultant may only link to a company they already have an Engagement with, so the field cannot be used to enumerate which companies exist.

Linking and unlinking may both be done by the owner OR by a Company Admin. A wrong link is a factual error in the company's records, and the Admin is the person positioned to see and correct it in either direction. The engagement check is company-scoped, so an Admin is bound by the same constraint as the owner and cannot link to a company the company has no relationship with. Either action performed on a record the actor does not own MUST be written to the company audit log.

Every path that sets `clientcompanyid` MUST enforce the engagement check. There are exactly three, and no more may be added without amending this requirement: creation (owner only, on a record that does not yet exist), and the link and unlink endpoints (owner or Company Admin, audit-logged when the actor is not the owner).

It MUST NOT be settable through the general update endpoint. That path exists for customer detail, has different permission rules, and adding the link to it would give the field two authorities that drift apart until one stops enforcing the check.

### FR-005 — Engagement visibility

Where a Customer is linked, the system MUST display the engagements between that client company and the consultant's company, read-only, including ended ones, most recent first, showing state and start and end dates. Every engagement action stays in SCOPE-037. Absence of engagements is shown plainly, not as an error.

### FR-006 — Project association

A Project MAY be assigned to exactly one Customer via a nullable customerid on companyprojects. Assignable and reassignable by the project owner. Reassignment does not rewrite historical time entries. Unassigned projects remain fully functional. One-to-many rather than many-to-many because a time entry rolls up to a project, and if that project had two customers nothing could say which one to invoice.

### FR-007 — Access control

Customer records MUST be visible only to their owner and to Company Admins. Owner has full read, write and archive. Company Admin in the same company has read, plus exactly two write areas: ownership transfer (FR-011) and managing the tenant link in both directions (FR-004). Every other user, including other consultants in the same company, has no visibility. Enforced server-side on every endpoint, not by hiding UI. Ownership is checked against the record, never inferred from the request.

The Admin writes are corrective rather than editorial — one releases a departing consultant's records, the other fixes a wrong label. Neither creates or alters customer detail, and neither grants access to anything. Any further widening of Admin write access should be treated as a change to this requirement, not an implementation detail.

### FR-008 — Restore the Consultant Dashboard Customers rail

The dashboard MUST show the customer panel the approved design specifies: customer name, project count, and once SPEC-017's connection layer lands, connection health. An Add customer entry point is present. This reinstates the 7/5 split from the approved design, replacing the full-width projects panel shipped as path (c) on 2026-07-31.

### FR-009 — Unblock the SPEC-017 connection layer

This spec MUST provide the customers table that SPEC-017's four tables reference, so their customerid foreign keys resolve. Gate 5 in SPEC-017's plan is cleared by this spec existing. The connection tables themselves stay in SPEC-017 and are not built here.

### FR-010 — Manual schema application

All DDL MUST follow SCOPE-117. Reviewed SQL is applied by hand; drizzle-kit push is prohibited because the local DATABASE_URL points at production. Changes are verified with npm run db:drift and recorded in the SCOPE-117 schema change log. Naming follows the convention: lowercase, concatenated, no underscores. Primary keys are UUID v7 generated app-side, never gen_random_uuid.

### FR-011 — Ownership transfer on offboarding

Customer ownership MUST be transferable, because ON DELETE RESTRICT makes offboarding a departing consultant impossible until their customers are reassigned. A Company Admin can transfer every Customer owned by one consultant to another in the same company in one action, or transfer customers singly. Transfer moves consultantid only; all other fields are unchanged. Projects associated with a transferred Customer keep their association. Historical time entries and invoices are not rewritten. Transfer is written to the company audit log with old owner, new owner, count and actor. Attempting to delete a consultant who still owns live customers fails with a message naming the count and pointing at the transfer action, not a raw foreign-key error. Only a Company Admin can transfer.
