# wxKanban Project Kit

## Directory and File Structure

The following directories and files are included in the kit and are required for a complete project setup. If a directory is listed, all its contents are needed:

```
.vscode/
_wxAI/
   commands/
   rules/
   scripts/
   settings.json
   settings.local.json
   wxai-implement-rules.md
logs/
mcp-server/
resources/
scripts/
wxkanban-agent/
ai-settings.json
AI.md
package.json
package-lock.json
project-kit.md
ProjectOverview.md
README.md
TODO.md
wxkanban-agent-orchestrator-draft.md
```


## Purpose
This project kit provides everything needed to bootstrap a new wxKanban project with full enforcement, governance, and deterministic workflow. It includes all orchestrator commands, enforcement rules, and automation scripts required for compliance and auditability.

---

## What’s Included
- **Orchestrator Commands**: All core, audit, utility, governance, and phase commands (see wxHelp).
- **Enforcement Rules**: All repo memory and project-specific rules, auto-copied to _wxAI/rules.
- **Pipeline Agent**: Full pipeline orchestrator with state persistence, error recovery, and parallel execution.
- **Automation Scripts**: Scripts to propagate rules and memory to every new project.
- **Database Integration**: Secure, encrypted access to the wxKanban database for this project only (no cross-project access).
- **Audit Logging**: All AI and orchestrator actions are logged for compliance.
- **Governance**: Scope-first, database-first, and document protection rules enforced at every step.

---

## How to Create a New Project

1. **Clone or Generate from Kit**  
   Use this kit as the base for your new project. Do not copy database credentials or secrets to any other project.

2. **Initialize Project ID**  
   - Assign a unique projectid (UUID or sequential NNN).
   - Update all references in specs/, _wxAI/, and config files.

3. **Database Access**  
   - The kit includes an encrypted connection string for the wxKanban database.
   - Only this project may use this connection; do not share or reference it elsewhere.
   - All database operations (spec, task, document insertion) are performed via orchestrator commands (dbpush, pipeline agent, etc.).

4. **Enforcement Rules**  
   - All rules in _wxAI/rules/ are auto-copied and indexed.
   - These rules are enforced by the orchestrator and must not be bypassed except with explicit --force --reason and audit logging.

5. **Orchestrator Workflow**  
   - Use the orchestrator commands (see wxHelp) to manage the full project lifecycle: buildscope → createspecs → implement → dbpush → humantest → beta → release.
   - The pipeline agent manages state, error recovery, and parallel execution.

6. **Audit and Compliance**  
   - All actions are logged.
   - No implementation may proceed without database verification and scope compliance.

7. **Updates**  
   - On every install or update, the kit auto-syncs the latest enforcement rules and memory files.

---

## Security & Isolation
- **Database credentials are encrypted and project-scoped.**
- **No other project may reference or use this kit’s database connection.**
- **Do not share, export, or copy the encrypted connection string.**

---

## Quick Start

```bash
# Clone or generate new project from kit
git clone <kit-repo-url> my-new-project
cd my-new-project

# Install dependencies and auto-sync rules
npm install

# Start orchestrator workflow
npm run dbpush
# or
npx ts-node wxkanban-agent/core/orchestrator/command-handlers/pipeline-agent.ts run "Describe your feature"
```

---

## References
- _wxAI/rules/index.md — All enforcement and governance rules
- _wxAI/commands/wxHelp.md — Full command list and usage
- /memories/repo/ — Source of all enforcement rules (auto-synced)
- _wxAI/commands/ — Command documentation and specs

---

## Implementation Checklist
- [x] Orchestrator commands scaffolded and integrated
- [x] Enforcement rules and repo memory automation
- [x] Pipeline agent with state, error recovery, parallel execution
- [x] Automation scripts for rule propagation
- [x] Secure, project-scoped database integration
- [x] Audit logging and compliance enforcement
- [x] Kit auto-update on install/update
- [ ] Final integration testing and polish (run npm install, dbpush, and pipeline agent to verify)

---

> For any missing implementation or integration, run the orchestrator commands and automation scripts as described above. All core logic and enforcement is present; only final integration and project-specific adjustments may remain.
