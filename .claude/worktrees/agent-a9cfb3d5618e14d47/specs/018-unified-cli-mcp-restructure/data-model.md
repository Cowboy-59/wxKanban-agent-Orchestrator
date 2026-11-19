# Data Model: Unified CLI and AI Gateway (Spec 018)

## Overview

This document defines the data model for the new database entities required by Spec 018. The entities support MCP drift event logging, update adoption tracking, and parity CI gate configuration.

> **DB Naming Convention:** All table names and field names are lowercase with no underscores. See CLAUDE.md conventions.

---

## Entity Relationship Diagram

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│        projects         │     │       mcpdriftevents         │
├─────────────────────────┤     ├──────────────────────────────┤
│ id (PK)                 │◄────┤ projectid (FK)               │
│ name                    │     │ id (PK)                      │
│ ...                     │     │ projectidentifier            │
└─────────────────────────┘     │ mcpversionmain               │
                                │ mcpversionkit                │
                                │ changedpaths                 │
                                │ severity                     │
                                │ githubfeedbackref            │
                                │ resolvedstatus               │
                                │ resolvedat                   │
                                │ createdat                    │
                                └──────────────────────────────┘

┌─────────────────────────┐     ┌──────────────────────────────┐
│        projects         │     │      mcpupdateadoptions      │
├─────────────────────────┤     ├──────────────────────────────┤
│ id (PK)                 │◄────┤ projectid (FK)               │
│ name                    │     │ id (PK)                      │
│ ...                     │     │ mcpversion                   │
└─────────────────────────┘     │ decisionstate                │
                                │ decidedat                    │
                                │ maintenancewindow            │
                                │ nextreminderat               │
                                │ deferralicount               │
                                │ createdat                    │
                                │ updatedat                    │
                                └──────────────────────────────┘

┌──────────────────────────────┐
│       mcpparityconfig        │
├──────────────────────────────┤
│ id (PK)                      │
│ gatemode                     │
│ advisorystartedat            │
│ mandatoryactivatedat         │
│ rollbackat                   │
│ rollbackby                   │
│ createdat                    │
│ updatedat                    │
└──────────────────────────────┘
```

---

## Table Definitions

### 1. mcpdriftevents

Stores MCP parity drift events emitted by CI parity checks across all projects.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v7() | Unique identifier |
| projectid | UUID | NOT NULL, FK → projects.id | Associated wxKanban project |
| projectidentifier | VARCHAR(255) | NOT NULL | External project identifier string |
| mcpversionmain | VARCHAR(50) | NOT NULL | Version of main MCP at time of check |
| mcpversionkit | VARCHAR(50) | NOT NULL | Version of project-kit MCP at time of check |
| changedpaths | JSONB | NOT NULL, DEFAULT '[]' | Array of file paths that diverged |
| severity | VARCHAR(20) | NOT NULL, CHECK | 'critical', 'high', 'medium', 'low' |
| githubfeedbackref | VARCHAR(500) | NULL | GitHub issue/discussion URL or reference |
| resolvedstatus | VARCHAR(20) | NOT NULL, DEFAULT 'open', CHECK | 'open', 'resolved', 'suppressed' |
| resolvedat | TIMESTAMPTZ | NULL | When drift event was resolved |
| createdat | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When drift event was recorded |

**Indexes:**
- `mcpdriftevents_projectid_idx` ON (projectid)
- `mcpdriftevents_severity_idx` ON (severity)
- `mcpdriftevents_resolvedstatus_idx` ON (resolvedstatus)
- `mcpdriftevents_createdat_idx` ON (createdat)

---

### 2. mcpupdateadoptions

Tracks per-project MCP update acceptance, deferral, and reminder state.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v7() | Unique identifier |
| projectid | UUID | NOT NULL, FK → projects.id | Associated wxKanban project |
| mcpversion | VARCHAR(50) | NOT NULL | MCP release version this record tracks |
| decisionstate | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK | 'pending', 'accepted', 'deferred', 'rejected' |
| decidedat | TIMESTAMPTZ | NULL | When the user last made a decision |
| maintenancewindow | JSONB | NULL | Optional: {start, end, tz} for scheduled adoption |
| nextreminderat | TIMESTAMPTZ | NULL | Next scheduled 30-day reminder timestamp |
| deferralcount | INTEGER | NOT NULL, DEFAULT 0 | Number of times update was deferred |
| createdat | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When record was created |
| updatedat | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When record was last updated |

**Unique Constraint:**
- UNIQUE ON (projectid, mcpversion)

**Indexes:**
- `mcpupdateadoptions_projectid_idx` ON (projectid)
- `mcpupdateadoptions_decisionstate_idx` ON (decisionstate)
- `mcpupdateadoptions_nextreminderat_idx` ON (nextreminderat)

---

### 3. mcpparityconfig

Global configuration for the parity CI gate mode. One active row expected.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v7() | Unique identifier |
| gatemode | VARCHAR(20) | NOT NULL, DEFAULT 'advisory', CHECK | 'advisory', 'mandatory' |
| advisorystartedat | TIMESTAMPTZ | NULL | When advisory mode was first activated |
| mandatoryactivatedat | TIMESTAMPTZ | NULL | When mandatory mode was promoted |
| rollbackat | TIMESTAMPTZ | NULL | When gate was rolled back to advisory |
| rollbackby | UUID | NULL, FK → users.id | User who initiated rollback |
| createdat | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updatedat | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

---

## Migration Notes

- Migrations generated via `npm run db:generate`
- All tables use UUID v7 primary keys
- `mcpdriftevents.changedpaths` uses JSONB array for flexibility in path count
- `mcpupdateadoptions.maintenancewindow` uses JSONB for structured window metadata
- `mcpparityconfig` is a singleton config table; enforce via application logic

## Drizzle Schema Locations

```
src/db/schema/mcpdriftevents.ts
src/db/schema/mcpupdateadoptions.ts
src/db/schema/mcpparityconfig.ts
```
