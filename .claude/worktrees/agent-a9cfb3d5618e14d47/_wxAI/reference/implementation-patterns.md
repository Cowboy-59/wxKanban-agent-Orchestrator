# Reference — Core Implementation Patterns

> On-demand reference module (SCOPE-093 / T001). Extracted from CLAUDE.md so it loads
> only when work touches one of these domains. Read this file when implementing
> authentication, PM-system integration, the 6-phase workflow, time tracking, or invoice
> generation — or when you need the performance targets.

## Authentication

- **Registration**: Email + password → bcrypt hash → JWT token
- **Login**: Email + password → JWT (24-hour expiry) → httpOnly cookie
- **Validation**: JWT middleware validates all authenticated endpoints

## PM System Integration

- **OAuth2**: Exchange auth code for access token (encrypted in DB)
- **Sync**: Background job every 5-15 min, fetch tasks via PM API
- **Errors**: Don't block on sync failure, retry next cycle
- **Conflict Resolution**: Last-write-wins (wxKanban overwrites PM)

## 6-Phase Workflow

- **Design** → Specifications (001, 002, ...) must be approved
- **Implementation** → Tasks linked to specs must complete
- **QA** → Test plans (mapped to specs) must pass
- **HumanTesting** → Feedback items can become new specs
- **Beta** → Modifications require explicit approval
- **Release** → All prior phases must be complete, method selected

## Time Tracking

- **Timer**: Client-side elapsed time tracking
- **Storage**: timeentries records with starttime, endtime, duration
- **Inactivity**: Prompt if timer > 8 hours (default, configurable)
- **Billable**: Boolean flag per entry, aggregated for invoicing

## Invoice Generation

- **Query**: timeentries WHERE (projectid, billable=true, date range)
- **Calculate**: hoursWorked = SUM(duration) / 60 × hourlyRate
- **Generate**: PDF via Puppeteer (HTML template rendering)
- **Track**: Mark timeentries.invoiced=true to prevent duplicates

---

## Performance Targets

- Dashboard load: < 10 seconds
- Task sync: < 5 minutes (periodic)
- Invoice generation: < 2 minutes
- Sync reliability: 99% success
- Timer accuracy: ±60 seconds
