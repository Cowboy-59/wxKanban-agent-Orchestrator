---
description: Guided onboarding for untrained developers — explains the 6-phase lifecycle, scope-first rule, and walks through scope creation step by step
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxAI-training

**Developer Onboarding & Scope Creation Guide** — Provides a guided experience for developers who are new to wxKanban, don't know what scope their work belongs to, or need to create a new scope from scratch.

## User Input

```text
{{args}}
```

---

## Purpose

When a developer asks AI to build something and no matching scope exists, the AI must not simply refuse and stop. Instead, it enters training mode — guiding the developer through understanding the system and creating the scope correctly.

This command serves two audiences:
1. **Untrained developers** — need to understand the wxKanban lifecycle before they can work effectively
2. **Trained developers creating new scopes** — need a structured guided process to define scope requirements

---

## Mode Detection

Check the user input to determine which mode to run:

- `wxai training` (no args) → **Full onboarding** (start from the beginning)
- `wxai training --new-scope` → **Scope creation only** (skip lifecycle explanation)
- `wxai training --explain` → **Explain a concept** (answer a specific question)
- Called from `wxAI-scope-check` when no scope found → **Scope creation mode**

---

## PART 1: Full Onboarding (for untrained developers)

### Welcome Message

```
👋 WELCOME TO wxKanban DEVELOPER TRAINING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
wxKanban is a project management system built around structured AI development.

Before we can build anything, we need to understand how the system works.
This training takes about 10-15 minutes and will make you much more effective.

Let's start with the most important concept: the 6-Phase Lifecycle.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Lesson 1: The 6-Phase Lifecycle

```
📚 LESSON 1: THE 6-PHASE LIFECYCLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every feature in wxKanban goes through 6 phases before it's complete:

  Phase 1 — DESIGN
    What: Specification, planning, clarification, task creation
    Output: spec.md, plan.md, tasks.md, quickstart.md
    Who: AI + Developer together

  Phase 2 — IMPLEMENTATION
    What: Writing code, building functionality
    Output: Working code, passing tests
    Who: AI (guided by tasks.md)

  Phase 3 — QA TESTING
    What: Automated testing, compliance checks (SOC2, HITRUST)
    Output: Test reports, >90% coverage
    Who: AI (automated)

  Phase 4 — HUMAN TESTING
    What: Manual validation, user acceptance testing
    Output: UAT sign-off, no P0/P1 bugs
    Who: Human developer

  Phase 5 — BETA RELEASE
    What: Limited production deployment, feedback collection
    Output: Beta metrics, stable performance
    Who: Human + real users

  Phase 6 — RELEASE
    What: General availability, production deployment
    Output: Live feature, monitoring active
    Who: Human (deployment)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Press ENTER to continue to Lesson 2...
```

---

### Lesson 2: The Scope-First Rule

```
📚 LESSON 2: THE SCOPE-FIRST RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The most important rule in wxKanban:

  ⚡ NO CODE WITHOUT A SCOPE ⚡

This means: Before any AI assistant writes, modifies, or deletes code,
the work MUST be linked to a verified scope in the wxKanban database.

WHY THIS RULE EXISTS:
  ✅ Management can see what AI is building and why
  ✅ Work is tracked and auditable
  ✅ Developers don't build things that conflict with other work
  ✅ AI doesn't go off-script and build things nobody asked for
  ✅ Every change has a documented reason

WHAT IS A SCOPE?
  A scope is a defined unit of work with:
  - A number (e.g., 012)
  - A title (e.g., "Kanban View")
  - A specification document (spec.md)
  - A list of tasks (tasks.md)
  - A lifecycle phase (Design → Release)
  - A record in the wxKanban database

WHAT HAPPENS WITHOUT A SCOPE?
  The AI will BLOCK your request and ask you to either:
  1. Find an existing scope that covers your work
  2. Create a new scope (this training will show you how)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Press ENTER to continue to Lesson 3...
```

---

### Lesson 3: What is a Scope Document?

```
📚 LESSON 3: SCOPE DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every scope has a set of documents that define it:

  specs/Project-Scope/<NNN>-<name>.md   ← The scope overview (what & why)
  specs/<NNN>-<name>/spec.md            ← Functional requirements
  specs/<NNN>-<name>/plan.md            ← Technical implementation plan
  specs/<NNN>-<name>/tasks.md           ← Breakdown of all tasks
  specs/<NNN>-<name>/quickstart.md      ← Test scenarios
  specs/<NNN>-<name>/lifecycle.json     ← Phase tracking

These documents are created BEFORE any code is written.
They are also stored in the wxKanban database so management can review them.

EXAMPLE: Scope 012 — Kanban View
  specs/Project-Scope/012-scope-KanbanView.md
  specs/012-KanbanView/spec.md
  specs/012-KanbanView/plan.md
  specs/012-KanbanView/tasks.md
  specs/012-KanbanView/quickstart.md
  specs/012-KanbanView/lifecycle.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to create your first scope? Press ENTER to continue...
```

---

## PART 2: Scope Creation (6-Question Process)

This part runs when:
- Developer completes onboarding and is ready to create a scope
- Developer runs `wxai training --new-scope`
- `wxAI-scope-check` redirects here because no scope was found

### Introduction

```
🆕 SCOPE CREATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I'll ask you 6 questions to define your new scope.
Take your time — good answers here make implementation much smoother.

Your answers will be used to create:
  ✅ A scope overview document
  ✅ A functional specification (spec.md)
  ✅ A technical plan (plan.md)
  ✅ A task breakdown (tasks.md)
  ✅ A database record in wxKanban

Let's begin.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Question 1 — Name

```
QUESTION 1 of 6: What is the name of this feature or change?

Give it a short, descriptive name (2-5 words).

Examples:
  "Email Notifications"
  "Dark Mode Toggle"
  "Task Assignment Workflow"
  "API Rate Limiting"

Your answer: _
```

### Question 2 — Problem

```
QUESTION 2 of 6: What problem does this solve?

Describe the problem or need in 1-3 sentences.
Think about: What is currently broken, missing, or painful?

Example:
  "Users don't get notified when tasks are assigned to them.
   They have to manually check the system, which causes delays
   and missed deadlines."

Your answer: _
```

### Question 3 — Users

```
QUESTION 3 of 6: Who are the users of this feature?

List the user types who will use or be affected by this feature.

Examples:
  "Project managers, developers, clients"
  "System administrators only"
  "All logged-in users"
  "External API consumers"

Your answer: _
```

### Question 4 — Main Functions

```
QUESTION 4 of 6: What are the main functions or capabilities?

List 3-7 things this feature must do.

Example for "Email Notifications":
  1. Send email when a task is assigned to a user
  2. Send email when a task's due date is approaching (24h warning)
  3. Send email when a task is marked complete
  4. Allow users to configure which notifications they receive
  5. Allow users to unsubscribe from all notifications

Your answer: _
```

### Question 5 — Security & Compliance

```
QUESTION 5 of 6: Are there any security or compliance requirements?

Consider:
  - Does this handle personal data? (GDPR implications)
  - Does this need audit logging? (SOC2/HITRUST)
  - Are there authentication/authorization requirements?
  - Are there data retention requirements?

Examples:
  "Email addresses are personal data — GDPR consent required"
  "All notification sends must be logged for SOC2 audit trail"
  "Only the assigned user and their manager can see notifications"
  "No special requirements"

Your answer: _
```

### Question 6 — Connections

```
QUESTION 6 of 6: What does this connect to or depend on?

List any existing scopes, systems, or components this feature
needs to work with.

Examples:
  "Depends on Scope 009 (Task & Lifecycle) for task events"
  "Uses Mailgun for email delivery (already configured)"
  "Connects to Scope 006 (Settings) for user preferences"
  "No dependencies — standalone feature"

Your answer: _
```

---

### Scope Summary & Confirmation

After collecting all 6 answers, present a summary:

```
📋 SCOPE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Proposed Scope Number: 016
Title: Email Notifications

Problem:
  Users don't get notified when tasks are assigned to them.
  They have to manually check the system, causing delays.

Users: Project managers, developers, clients

Main Functions:
  1. Send email when task is assigned
  2. Send email for due date warnings (24h)
  3. Send email when task is completed
  4. User notification preferences
  5. Unsubscribe capability

Security/Compliance:
  - GDPR: Email addresses are personal data, consent required
  - SOC2: All sends logged to companyauditlogs

Dependencies:
  - Scope 009 (Task & Lifecycle) — task events
  - Mailgun (already configured)
  - Scope 006 (Settings) — user preferences

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Does this look correct? (yes/edit/cancel): _
```

---

### Document Creation

After confirmation, create all scope documents:

1. **Create scope overview**: `specs/Project-Scope/<NNN>-<name>.md`
2. **Run wxAI-specify**: Generate `specs/<NNN>-<name>/spec.md`
3. **Run wxAI-plan**: Generate `specs/<NNN>-<name>/plan.md`
4. **Run wxAI-tasks**: Generate `specs/<NNN>-<name>/tasks.md`
5. **Run wxAI-quickstart**: Generate `specs/<NNN>-<name>/quickstart.md`
6. **Create lifecycle.json**: Initialize phase tracking
7. **Insert into database**: `wxk_scope_import` + `wxk_doc_import`
8. **Update projectlifecycle.md**: Add new scope row

Display progress:
```
🔨 CREATING SCOPE DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ specs/Project-Scope/016-EmailNotifications.md
  ✅ specs/016-EmailNotifications/spec.md
  ✅ specs/016-EmailNotifications/plan.md
  ✅ specs/016-EmailNotifications/tasks.md
  ✅ specs/016-EmailNotifications/quickstart.md
  ✅ specs/016-EmailNotifications/lifecycle.json
  ✅ Database: Scope 016 inserted (wxk_scope_import)
  ✅ Database: 6 documents inserted (wxk_doc_import)
  ✅ specs/projectlifecycle.md updated

Scope 016 — Email Notifications is ready for implementation!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## CLI Usage

```bash
# Full onboarding (new developer)
wxai training

# Create new scope only (skip lifecycle lessons)
wxai training --new-scope

# Explain a specific concept
wxai training --explain "scope-first rule"
wxai training --explain "lifecycle phases"
wxai training --explain "TODO linking"

# Quick scope creation with pre-filled name
wxai training --new-scope --name "Email Notifications"
```

---

## Mistral AI Integration

When Mistral AI is the active provider, this command uses conversational scope creation:
- Natural language dialogue instead of numbered questions
- Mistral generates `scope.md` (conversational summary) alongside `spec.md`
- Mistral generates `ProjectDesign.md` for overall project viewpoint
- More flexible, less structured — suitable for early-stage ideation

To activate Mistral mode: `wxai training --new-scope --ai mistral`
