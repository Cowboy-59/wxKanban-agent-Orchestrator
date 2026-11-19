# Feature Specification: Team Assignments & Duties Management

**Feature Number**: `004-team-assignments`
**Created**: 2026-02-15
**Status**: Draft
**Input**: Team member role assignments with compliance-based duty allocation

---

## Overview

The Team Assignments feature enables organizations to assign specific duties/roles to team members on projects based on the project's security classification (HiTrust or SOC 2). The system manages role-based task assignment workflows, enforces compliance rules, and allows administrators to customize available duty types for their subscription.

---

## User Scenarios & Testing

### Primary User Story

As a Team Manager on a SOC 2 classified project, I need to assign duties to team members as tasks are completed, ensuring that the assignments follow compliance requirements. The system should intelligently suggest the next duty based on the task completion flow, reducing manual assignment overhead while maintaining compliance with security standards.

### Acceptance Scenarios

1. **Given** a task is completed on a project with multiple duties, **When** the task is marked complete, **Then** the system identifies which duty should perform the next task (based on duty sequence) and either auto-assigns or prompts the Team Manager to select from available duties.

2. **Given** a Team Manager attempts to assign a duty to a team member that violates compliance rules (SOC 2 or HiTrust), **When** the assignment is submitted, **Then** the system displays a warning showing which compliance rule is violated, but allows the Team Manager to override the warning by providing a documented reason for the assignment.

3. **Given** a project with "ALL" as the only available duty, **When** a task is completed, **Then** the system automatically assigns the task to all team members without prompting, as this represents a single-source project structure.

4. **Given** an admin managing subscription settings, **When** the admin customizes the duty types available for their subscription, **Then** these custom duty types are applied to new projects created under that subscription, replacing the default duty types.

5. **Given** a team member assigned multiple duties that conform to compliance rules, **When** tasks are assigned to that team member, **Then** the system correctly routes tasks to the appropriate duty based on task type and workflow requirements.

### Edge Cases

- What happens when a team member's duties change mid-project? (Existing task assignments remain unchanged; future assignments use updated duties)
- How does the system handle a project with no available duties? (Error: admin must configure at least one duty type)
- What if all available duties have been "used" in task workflow? (System cycles back to the beginning or prompts Team Manager for override)
- Can a team member have overlapping/conflicting duties assigned? (Only if SOC 2 and HiTrust rules permit; warning shown otherwise)

---

## Requirements

### Functional Requirements

#### Duty Management
- **FR-001**: System MUST provide a default set of duty types based on project security classification (HiTrust or SOC 2).
- **FR-002**: Default duty types MUST include: Developer, Design Coordinator, System Review, Team Manager, QA, Final Acceptance Review, Publisher, Security Team Manager, and ALL.
- **FR-003**: System MUST allow administrators to add custom duty types to their subscription.
- **FR-004**: System MUST allow administrators to remove duty types from their subscription (cannot remove default types unless explicitly allowed per SOC 2/HiTrust rules). Changes to subscription duty types MUST be applied to all existing projects and all new projects created under that subscription.
- **FR-005**: System MUST apply admin-customized duty types to new projects created under that subscription.

#### Task Completion & Assignment Workflow
- **FR-006**: When a task is completed, the system MUST identify the next duty in the fixed global assignment sequence: Developer → Design Coordinator → System Review → QA → Final Acceptance Review → Publisher.
- **FR-007**: If multiple duties are available as the next assignment in the sequence, the system MUST prompt the Team Manager to select which duty should be assigned the next task.
- **FR-008**: If only one duty is available as the next assignment in the sequence, the system MUST automatically assign the next task to that duty without prompting.
- **FR-009**: If "ALL" is the only available duty on a project, the system MUST automatically assign all tasks to all team members without prompting, and MUST NOT ask for manual duty selection.

#### Team Member Duty Assignment
- **FR-010**: Team Managers MUST be able to assign one or more duties to a team member on a project.
- **FR-011**: System MUST validate all duty assignments against SOC 2 and HiTrust compliance rules before assignment is completed.
- **FR-012**: If a proposed assignment violates compliance rules, the system MUST display a specific warning identifying which rule(s) are violated.
- **FR-013**: When a compliance violation warning is shown, the Team Manager MUST be able to override the warning by providing a documented reason for the assignment.
- **FR-014**: Once a reason is documented and confirmed, the system MUST permit the assignment even if it violates compliance rules.
- **FR-015**: All duty assignments that override compliance warnings MUST be logged with the Team Manager name, timestamp, assigned duties, and documented reason.

#### Compliance & Validation

**SOC 2 Compliance Rules** (Separation of Duties):
- A person assigned as Developer CANNOT also be assigned as QA or Final Acceptance Reviewer.
- A person assigned as System Review CANNOT also be assigned as Developer or QA.
- A person assigned as Final Acceptance Reviewer CANNOT also be assigned as Developer, Design Coordinator, or QA.
- A person assigned as Security Team Manager CAN be assigned alongside any other duties (security oversight role).
- All other duty combinations are permitted under SOC 2.

**HiTrust Compliance Rules** (Stricter Separation of Duties):
- A person assigned as Developer CANNOT also be assigned as QA, Final Acceptance Reviewer, or Publisher.
- A person assigned as System Review CANNOT also be assigned as Developer, QA, or Publisher.
- A person assigned as Final Acceptance Reviewer CANNOT also be assigned as Developer, Design Coordinator, QA, or Publisher.
- A person assigned as Publisher CANNOT also be assigned as Developer, QA, or Final Acceptance Reviewer.
- A person assigned as Security Team Manager CAN be assigned alongside any other duties, but each additional duty adds audit/review requirements.
- Team Manager and Design Coordinator can be assigned with any other duty.
- All other combinations require explicit override documentation.

**Functional Requirements**:
- **FR-016**: System MUST enforce SOC 2 compliance rules for duty assignments on SOC 2-classified projects according to the rules defined above.
- **FR-017**: System MUST enforce HiTrust compliance rules for duty assignments on HiTrust-classified projects according to the rules defined above. HiTrust rules are stricter and take precedence.
- **FR-018**: When a duty assignment violates these specific compliance rules, the system MUST identify the specific rule(s) violated and display them in the warning message.

#### Project Setup
- **FR-019**: When a new project is created with a security classification (HiTrust or SOC 2), the system MUST automatically populate the available duties based on the selected classification.
- **FR-020**: Project administrators MUST be able to customize the duty types for a specific project (in addition to subscription-level customization).

### Key Entities

- **Team Member**: A person assigned to a project with one or more duties/roles. Attributes: name, email, assigned duties, project membership.
- **Duty/Role**: A functional role on a project (e.g., Developer, QA, Team Manager). Each duty represents a specific responsibility or skill area.
- **Project**: A container for tasks and team assignments. Attributes: security classification (HiTrust/SOC 2), assigned duties, team members.
- **Task Assignment**: Links a task to a team member assigned a specific duty. Attributes: task, team member, assigned duty, completion status.
- **Compliance Override**: Records when a Team Manager overrides a compliance warning. Attributes: override timestamp, Team Manager, duties assigned, documented reason.

---

## Success Criteria

1. **Compliance Adherence**: 100% of duty assignments either conform to SOC 2/HiTrust rules or are explicitly documented with override reasons. No silent compliance violations.

2. **Workflow Efficiency**: For projects with a defined duty sequence, 90% of task assignments are either automatically assigned (when only one duty is available) or completed within 2 clicks (when prompting Team Manager to select).

3. **Accuracy**: Duty type customization by admins is correctly applied to new projects within 1 business day of configuration change.

4. **User Satisfaction**: Team Managers report that the duty assignment system (auto-assignment + prompts) reduces time spent on manual role selection by at least 50% compared to manual assignment.

5. **Documentation**: 100% of compliance override decisions are logged with complete audit trail (who, when, why, duties).

---

## Assumptions

1. **Compliance Rules Defined**: SOC 2 and HiTrust have specific, testable rules about which duties can be combined on a single person. These rules are defined in the spec (Compliance & Validation section) and encoded during implementation.

2. **Fixed Global Duty Sequence**: All projects use the same fixed sequence for task assignment workflow: Developer → Design Coordinator → System Review → QA → Final Acceptance Review → Publisher. This sequence is not configurable per project.

3. **Subscription-Wide Duty Type Changes**: When an admin adds or removes duty types from their subscription settings, this change applies retroactively to all existing projects and prospectively to all new projects created under that subscription. Project administrators cannot have different duty types than their subscription allows.

4. **Team Manager Authority**: Only Team Managers (and above) can override compliance warnings and assign duties. Individual contributors cannot self-assign duties.

5. **No Duty Removal During Project**: Duty types cannot be removed from a project while tasks are active. Admins can only add or reconfigure during project setup or via subscription-wide changes.

6. **Single Project Context**: All duty assignments and compliance checks are scoped to a single project; a team member's duties on one project do not affect availability or assignments on other projects.

---

## Dependencies & Related Features

- **Depends On**: Project creation and security classification (feature 005-Project Settings)
- **Blocked By**: Definition of specific SOC 2 and HiTrust compliance rules for duty combinations
- **Informs**: Task assignment workflow (tasks automatically routed based on duty assignments)
- **Enhances**: Admin management feature (feature 002-Admin Management) - admins can customize duty types

---

---
