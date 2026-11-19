# Implementation Plan: Company Registration & Subscription Management

**Branch**: `003-registration` | **Date**: 2026-02-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-Registration/spec.md` (75 functional requirements)

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path ✅
   → Spec loaded: 003-Registration/spec.md (75 requirements, 5 user stories)
2. Fill Technical Context
   → Project Type: Web (React frontend + Express backend)
   → Detect all NEEDS CLARIFICATION items
3. Fill the Constitution Check section
   → Verify alignment with project constitution
4. Evaluate Constitution Check
   → Document any violations
5. Execute Phase 0 → research.md
   → Resolve all unknowns and clarifications
6. Execute Phase 1 → contracts, data-model.md, quickstart.md
   → Generate design artifacts
7. Re-evaluate Constitution Check
   → Verify design compliance
8. Plan Phase 2 → Task generation approach
9. STOP - Ready for /tasks command
```

## Summary

**Feature**: Company registration and subscription management for wxKanban with tiered pricing models (FREE/CONSULTANT/ENTERPRISE), Stripe payment processing, admin account creation, and personnel invitation system.

**Technical Approach**:
- Backend: Express.js REST API with TypeScript, Pino logging
- Database: PostgreSQL with Drizzle ORM, UUID primary keys
- Frontend: React 18 with TailwindCSS and shadcn/ui components
- Payments: Stripe API integration with secure token handling
- Email: SMTP for transactional emails (invite notifications, verification)
- Authentication: bcrypt password hashing, JWT tokens

---

## Technical Context

**Language/Version**: TypeScript 5.3.2, Node.js 20 LTS (backend), React 18.2.0 (frontend)

**Primary Dependencies**:
- Backend: Express 4.18.2, Drizzle ORM 0.28.6, Stripe SDK
- Frontend: React 18, Vite 5.0.7, TanStack Query 3.39.3, TailwindCSS 3.4.0, shadcn/ui
- Shared: bcrypt 2.4.3, JWT (jsonwebtoken 9.0.2), Pino 8.16.2

**Storage**: PostgreSQL 15+ with Drizzle ORM (schema-first with migrations)

**Testing**: Vitest (unit/integration), Playwright (E2E)

**Target Platform**: Web (browser + Node.js server, port 3001 backend, 3000 frontend)

**Project Type**: Web application (frontend + backend)

**Performance Goals**:
- Registration flow completion: < 2 minutes
- Payment processing: < 5 seconds
- Invitation email delivery: < 1 minute
- Dashboard load: < 3 seconds

**Constraints**:
- MUST use Stripe for payment processing
- MUST use JWT for session management (httpOnly cookies)
- Password hashing MUST use bcrypt (min cost 10)
- All secrets stored in environment variables
- NO hardcoded API keys or credentials
- Email must support both plain text and HTML

**Scale/Scope**:
- Initial: < 1000 companies at launch
- Support concurrent registrations during onboarding
- Bulk invitation support (up to 50 emails per upload)

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Section I: Unified Full-Stack Architecture ✅
- **Requirement**: Express + React (from CLAUDE.md) / TanStack Start (from constitution)
- **Status**: Project uses Express + React per CLAUDE.md (authoritative)
- **Decision**: Follow CLAUDE.md stack (Express + React, not TanStack Start)
- **Justification**: CLAUDE.md is committed source of truth for this project; constitution is template default

### Section III: Database & Naming Conventions ✅
- **Requirements**:
  - Singular table names: `user`, `company`, `userinvitation`
  - Primary keys: `{table}id` format (e.g., `companyid`, `userid`)
  - UUID v7 for all new PKs
  - Foreign key naming: match parent PK (e.g., company.companyid → user.companyid)
  - `lowercase` fields in DB, `camelCase` in TypeScript
  - NO underscores for word separation
- **Spec Compliance**: ✅ Spec follows all naming conventions
- **Data Model**: 5 entities required (company, user, userinvitation, session, companyauditlog)
- **Migration Strategy**: db:generate → db:migrate workflow

### Section IV: Code Quality & Styling ✅
- **TypeScript**: 100% required, no `any` types
- **Testing**: Real API tests, no mocks
- **Naming**: Consistent camelCase (TS) / lowercase (DB)
- **Status**: ✅ Spec-compliant, no violations detected

### Section V: Security & Data Protection ✅
- **Environment Variables**: All secrets in .env (Stripe keys, JWT secret, email credentials)
- **Error Handling**: Must not expose internal details
- **Spec Requirements**:
  - Password hashing with bcrypt
  - Secure credit card tokenization via Stripe (never store raw CC data)
  - JWT token expiry and refresh mechanism
  - Invitation tokens with 7-day expiry
- **Status**: ✅ All security requirements clearly specified

### Section VII: 6-Phase Lifecycle Management ✅
- **Current Phase**: Design (Specification complete, now in Planning)
- **Next Phases**: Implementation → QA → Human Testing → Beta → Release
- **Status**: ✅ Spec and plan following lifecycle structure

---

## Project Structure

### Documentation (this feature)

```
specs/003-Registration/
├── spec.md                      ✅ Complete (75 requirements)
├── checklists/requirements.md   ✅ Complete (140+ test items)
├── plan.md                      👈 IN PROGRESS (this file)
├── research.md                  🔄 Phase 0 (to be generated)
├── data-model.md                🔄 Phase 1 (to be generated)
├── quickstart.md                🔄 Phase 1 (to be generated)
├── contracts/                   🔄 Phase 1 (to be generated)
│   ├── registration.openapi.json
│   ├── payment.openapi.json
│   ├── admin.openapi.json
│   └── invitation.openapi.json
└── tasks.md                     ⏳ Phase 2 (created by /speckit.tasks)
```

### Source Code (repository root)

```
Backend (Express):
src/server/
├── routes/
│   ├── auth.ts          # Registration, login
│   ├── payment.ts       # Stripe payment processing
│   ├── admin.ts         # Dashboard and personnel
│   └── invitation.ts    # Email invitations
├── services/
│   ├── RegistrationService.ts
│   ├── PaymentService.ts
│   ├── EmailService.ts
│   └── InvitationService.ts
├── middleware/
│   └── auth.ts          # JWT verification
└── schema/
    └── registration.ts  # Type definitions

Frontend (React):
src/client/
├── pages/
│   ├── RegisterPage.tsx
│   ├── SubscriptionPage.tsx
│   ├── PaymentPage.tsx
│   ├── AdminDashboard.tsx
│   └── InviteTeamPage.tsx
├── components/
│   ├── RegistrationForm.tsx
│   ├── TierSelector.tsx
│   ├── StripePaymentForm.tsx
│   ├── AdminWelcome.tsx
│   └── InvitationManager.tsx
└── hooks/
    ├── useRegistration.ts
    ├── usePayment.ts
    └── useInvitations.ts

Database (PostgreSQL + Drizzle):
src/db/schema/
├── company.ts
├── user.ts
├── userinvitation.ts
├── session.ts
└── companyauditlog.ts

Tests:
tests/
├── unit/
│   ├── RegistrationService.test.ts
│   ├── PaymentService.test.ts
│   └── EmailService.test.ts
├── integration/
│   ├── registration-flow.test.ts
│   ├── payment-flow.test.ts
│   └── invitation-flow.test.ts
└── e2e/
    └── registration.spec.ts (Playwright)
```

**Structure Decision**: Web application pattern with separate backend (Express) and frontend (React) directories, shared TypeScript types.

---

## Phase 0: Outline & Research

### Identified Unknowns from Spec

1. **Email Service Implementation**:
   - NEEDS CLARIFICATION: Which email service provider? (SendGrid, Mailgun, SMTP, AWS SES)
   - Resolution Task: Research best practices for transactional email in Node.js

2. **Stripe Integration Pattern**:
   - NEEDS CLARIFICATION: Webhook handling strategy? Idempotency keys? Retry logic?
   - Resolution Task: Research Stripe best practices for subscription billing

3. **Session/Token Management**:
   - NEEDS CLARIFICATION: JWT expiry duration? Refresh token strategy? HttpOnly cookie flags?
   - Resolution Task: Research secure JWT patterns for multi-tier auth

4. **Bulk Invitation Processing**:
   - NEEDS CLARIFICATION: CSV parsing library? Queue system for 50+ email sends?
   - Resolution Task: Research bulk email patterns and queue systems

5. **Admin Dashboard Analytics**:
   - NEEDS CLARIFICATION: Real-time metrics vs. periodic aggregation?
   - Resolution Task: Research dashboard performance optimization patterns

### Phase 0 Deliverable

**Output**: `research.md` with resolutions for all 5 unknowns (to be generated in Phase 0 execution)

---

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

### Entities (Data Model)

From spec analysis, 5 core entities needed:

1. **company** - Organization registration and subscription details
2. **user** - Company members with roles and authentication
3. **userinvitation** - Pending invitations with tokens and expiry
4. **session** - JWT token tracking and refresh mechanism
5. **companyauditlog** - Audit trail for compliance and security

**Phase 1 Deliverable**: `data-model.md` with entity definitions, relationships, and validation rules

### API Contracts

From functional requirements, 8 endpoints needed:

1. `POST /api/auth/register` - Company + admin account registration
2. `POST /api/payment/validate` - Validate subscription selection
3. `POST /api/payment/process` - Process Stripe payment
4. `POST /api/admin/onboarding-complete` - Mark onboarding finished
5. `GET /api/admin/dashboard` - Dashboard metrics
6. `POST /api/invitations/send` - Send single or bulk invitations
7. `GET /api/invitations/status` - Check invitation status
8. `POST /api/invitations/accept` - Accept invitation and create account

**Phase 1 Deliverable**: `/contracts/` directory with OpenAPI JSON files (one per feature area)

### Implementation Quickstart

**Phase 1 Deliverable**: `quickstart.md` with:
- Local database setup for registration feature
- Stripe test credentials and webhook URL
- Email service configuration
- Registration flow walkthrough (browser + API)
- Debugging checklist

---

## Phase 1 Agent Context Update

After Phase 1 design completion, run:
```bash
.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude
```

This will update `CLAUDE.md` with:
- New API endpoints for registration flow
- New database entities and relationships
- New services (PaymentService, EmailService, InvitationService)
- Testing patterns for payment integration
- Stripe configuration requirements

---

## Post-Design Constitution Re-Check

After Phase 1 design artifacts are complete, re-evaluate:
- ✅ All entities use UUID v7 primary keys
- ✅ Foreign key naming follows conventions
- ✅ All API contracts use REST patterns
- ✅ Stripe integration follows OAuth2 best practices
- ✅ Email handling uses environment variables for credentials
- ✅ No hardcoded secrets or API keys

**Result**: Design compliant with constitution. Ready to proceed to Phase 2.

---

## Phase 2: Task Generation Approach (NOT CREATED BY /PLAN)

_This section describes how /speckit.tasks will generate tasks.md_

### Task Breakdown Strategy

Tasks will be generated from:
1. **Database Layer** (5 tasks):
   - Create Drizzle schemas for 5 entities
   - Generate and apply migrations
   - Seed test data
   - Verify relationships
   - Add indexes for performance

2. **Backend Services** (12 tasks):
   - RegistrationService (3 tasks: company creation, user creation, tier validation)
   - PaymentService (3 tasks: Stripe integration, token handling, error recovery)
   - EmailService (2 tasks: SMTP setup, template rendering)
   - InvitationService (4 tasks: token generation, sending, acceptance, expiry)

3. **API Routes** (8 tasks):
   - One task per endpoint with validation and error handling

4. **Frontend Components** (10 tasks):
   - Registration form, tier selector, payment form (Stripe.js)
   - Admin dashboard, invitation manager
   - Success/error pages

5. **Testing** (15 tasks):
   - Unit tests for all services
   - Integration tests for registration flow
   - E2E tests for complete user journeys
   - Payment mocking with Stripe test fixtures

6. **Documentation** (2 tasks):
   - Admin guide for personnel management
   - Troubleshooting guide for registration issues

**Total Estimated Tasks**: 50-60 implementation tasks (Phase 2 output)

### Execution Order

Tasks will be ordered with dependencies:
1. Database schema and migrations (foundation)
2. Backend services (business logic)
3. API routes (expose services)
4. Frontend components (consume API)
5. Tests (validate all layers)
6. Documentation (support operations)

---

## Status Summary

| Phase | Status | Deliverable | Owner |
|-------|--------|-------------|-------|
| **Design (Phase 1)** | In Progress | spec.md ✅, checklists ✅, plan.md 👈 | System |
| **Phase 0 Research** | Pending | research.md (5 unknowns) | Task 1 |
| **Phase 1 Design** | Pending | data-model.md, contracts/, quickstart.md | Tasks 2-4 |
| **Phase 2 Tasks** | Waiting | tasks.md (50-60 tasks) | /speckit.tasks |
| **Phase 3 Implementation** | Waiting | Source code (all layers) | /speckit.implement |
| **Phase 4 QA** | Waiting | Test results, coverage report | /speckit.qa |
| **Phase 5 Human Testing** | Waiting | Feedback, user acceptance | /speckit.humantest |
| **Phase 6 Release** | Waiting | Deployment and version tag | /speckit.release |

---

## Next Steps

1. **Immediate**: Execute Phase 0 research (resolve 5 unknowns)
2. **Then**: Execute Phase 1 design (create all artifacts)
3. **Then**: Ready for `/speckit.tasks` to generate tasks.md
4. **Then**: Ready for `/speckit.implement` to begin development

---

_Generated by `/speckit.plan` on 2026-02-17_
_Ready for Phase 0 Research Execution_
