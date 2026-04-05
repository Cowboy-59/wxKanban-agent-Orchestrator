# wxKanban Agent Orchestrator Draft

This draft shows a practical way to separate lifecycle control from AI reasoning so your commands stay simple for users while the platform keeps project state, rules, and API updates protected.

## Goal

Commands like `buildscope`, `createspecs`, `createtesttasks`, and `implement` should feel simple at the surface, but they should execute through a deterministic workflow engine that:

- Knows the current project, feature, repo, branch, and lifecycle stage.
- Reads repo rules and command instructions.
- Calls the hidden online management API.
- Validates preconditions before each transition.
- Lets AI generate bounded artifacts, not uncontrolled state changes.

---

## High-level architecture

```text
User / CLI / Editor / MCP Host
          |
          v
   Command Gateway
          |
          v
   Workflow Orchestrator  <---- Repo Context Loader
          |                         |
          |                         v
          |                  Repo Rules / command.md
          |
          +----> Policy Engine
          |
          +----> AI Worker (bounded task)
          |
          +----> Lifecycle API Service
          |
          v
   Audit Log + Handoff Bundle
```

### Core idea

- The **orchestrator** is the only layer allowed to advance lifecycle stages.
- The **AI worker** drafts artifacts but never decides stage changes.
- The **lifecycle API service** is the only code that talks to your protected online management system.
- **MCP** becomes optional and thin: just another adapter into the same orchestrator.

---

## Suggested folder structure

```text
wxkanban-agent/
  apps/
    command-gateway/
      src/
        cli.ts
        http.ts
  core/
    context/
      project-context.ts
      repo-config.ts
    policy/
      command-policy.ts
      command-rules-loader.ts
    orchestrator/
      workflow-engine.ts
      transitions.ts
      command-handlers/
        buildscope.ts
        createspecs.ts
        createtesttasks.ts
        implement.ts
    schemas/
      commands.ts
      artifacts.ts
      lifecycle.ts
  services/
    lifecycle-api/
      lifecycle-client.ts
      feature-service.ts
      artifact-service.ts
  workers/
    ai/
      ai-client.ts
      buildscope-worker.ts
      createspecs-worker.ts
      createtesttasks-worker.ts
      implement-worker.ts
  adapters/
    mcp/
      server.ts
      tools/
        run-buildscope.ts
        run-createspecs.ts
        run-createtesttasks.ts
        run-implement.ts
  templates/
    specs/
    tasks/
  docs/
    command.md
```

---

## Lifecycle model

Example six-stage lifecycle:

```ts
export type LifecycleStage =
  | 'idea'
  | 'scoped'
  | 'specified'
  | 'test_tasks_ready'
  | 'implemented'
  | 'handoff_ready';
```

Example allowed commands by stage:

```ts
export const AllowedCommandsByStage: Record<LifecycleStage, string[]> = {
  idea: ['buildscope'],
  scoped: ['createspecs'],
  specified: ['createtesttasks'],
  test_tasks_ready: ['implement'],
  implemented: ['createhandoff'],
  handoff_ready: []
};
```

If you need approvals or rework loops, add transitions like `specified -> scoped` or `implemented -> specified` with explicit reasons.

---

## Project context contract

Every command run should resolve a single context object before doing anything.

```ts
export interface ProjectContext {
  tenantId: string;
  projectId: string;
  featureId: string;
  repoRoot: string;
  repoName: string;
  branchName: string;
  currentStage: LifecycleStage;
  actorId: string;
  actorType: 'human' | 'agent' | 'system';
  dbBindingKey: string;
  rulesPath: string;
  commandDocsPath: string;
  transport: 'cli' | 'mcp' | 'http';
}
```

This is the key to portability. New repos should not require custom code paths; they should just provide enough metadata to resolve this object.

---

## Repo config example

You want one repo-level file that tells the engine how to operate inside that project.

### `.wxai/project.json`

```json
{
  "projectId": "wxkanban",
  "tenantId": "wxperts",
  "dbBindingKey": "wxkanban-prod",
  "rulesPath": ".wxai/rules",
  "commandDocsPath": ".wxai/commands",
  "defaultBranch": "main",
  "allowedCommands": [
    "buildscope",
    "createspecs",
    "createtesttasks",
    "implement"
  ]
}
```

This file should be validated on startup. If it is missing or invalid, the run should fail hard with a clear message.

---

## Command contract

Each user-facing command should map to a strict input and output contract.

```ts
export interface CommandRequest<TInput = unknown> {
  command: 'buildscope' | 'createspecs' | 'createtesttasks' | 'implement';
  context: ProjectContext;
  input: TInput;
  correlationId: string;
  requestedAt: string;
}

export interface CommandResult<TArtifact = unknown> {
  success: boolean;
  command: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage | null;
  artifactIds: string[];
  artifact: TArtifact | null;
  warnings: string[];
  auditId: string;
}
```

---

## Policy engine

The policy engine decides whether a command is allowed before any AI call happens.

```ts
export interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
  requiredApprovals: string[];
}

export class CommandPolicyEngine {
  evaluate(request: CommandRequest): PolicyDecision {
    const allowedCommands = AllowedCommandsByStage[request.context.currentStage] ?? [];

    if (!allowedCommands.includes(request.command)) {
      return {
        allowed: false,
        reasons: [
          `Command ${request.command} is not allowed in stage ${request.context.currentStage}`
        ],
        requiredApprovals: []
      };
    }

    return {
      allowed: true,
      reasons: [],
      requiredApprovals: []
    };
  }
}
```

This is also where you enforce repo rules, approval gates, branch restrictions, or role checks.

---

## `command.md` loading

Treat `command.md` as a source of bounded instruction data, not as the system of record.

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

export interface CommandDoc {
  command: string;
  intent: string;
  requiredInputs: string[];
  requiredOutputs: string[];
  qualityGates: string[];
}

export async function loadCommandDoc(basePath: string, command: string): Promise<CommandDoc> {
  const filePath = path.join(basePath, `${command}.md`);
  const markdown = await fs.readFile(filePath, 'utf8');

  return {
    command,
    intent: markdown,
    requiredInputs: [],
    requiredOutputs: [],
    qualityGates: []
  };
}
```

Better version: frontmatter or YAML header in each command file, so you can parse required sections and gates structurally instead of relying on raw prose.

---

## Lifecycle API wrapper

Only this service can mutate the protected management system.

```ts
export interface LifecycleClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class LifecycleClient {
  constructor(private readonly options: LifecycleClientOptions) {}

  async createArtifact(payload: {
    projectId: string;
    featureId: string;
    artifactType: 'scope' | 'spec' | 'test_tasks' | 'implementation' | 'handoff';
    content: unknown;
  }) {
    return fetch(`${this.options.baseUrl}/artifacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  }

  async transitionFeature(payload: {
    projectId: string;
    featureId: string;
    fromStage: LifecycleStage;
    toStage: LifecycleStage;
    reason: string;
    correlationId: string;
  }) {
    return fetch(`${this.options.baseUrl}/features/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  }
}
```

The user should never be able to directly alter this layer from the repo.

---

## AI worker contract

The AI worker should only produce a typed artifact draft.

```ts
export interface ScopeDraft {
  title: string;
  problemStatement: string;
  objectives: string[];
  assumptions: string[];
  constraints: string[];
  acceptanceCriteria: string[];
}

export class BuildScopeWorker {
  async run(input: {
    featureTitle: string;
    featureSummary: string;
    repoRules: string;
    commandIntent: string;
  }): Promise<ScopeDraft> {
    return {
      title: input.featureTitle,
      problemStatement: '',
      objectives: [],
      assumptions: [],
      constraints: [],
      acceptanceCriteria: []
    };
  }
}
```

In production, this worker calls your model and validates the response against a schema before returning.

---

## Workflow engine

This is the part that turns a user command into a safe, repeatable pipeline.

```ts
export class WorkflowEngine {
  constructor(
    private readonly policy: CommandPolicyEngine,
    private readonly lifecycleClient: LifecycleClient,
    private readonly buildScopeWorker: BuildScopeWorker
  ) {}

  async runBuildScope(request: CommandRequest<{ featureTitle: string; featureSummary: string }>): Promise<CommandResult<ScopeDraft>> {
    const policyDecision = this.policy.evaluate(request);

    if (!policyDecision.allowed) {
      throw new Error(policyDecision.reasons.join('; '));
    }

    const commandDoc = await loadCommandDoc(request.context.commandDocsPath, 'buildscope');

    const draft = await this.buildScopeWorker.run({
      featureTitle: request.input.featureTitle,
      featureSummary: request.input.featureSummary,
      repoRules: request.context.rulesPath,
      commandIntent: commandDoc.intent
    });

    const artifactResponse = await this.lifecycleClient.createArtifact({
      projectId: request.context.projectId,
      featureId: request.context.featureId,
      artifactType: 'scope',
      content: draft
    });

    await this.lifecycleClient.transitionFeature({
      projectId: request.context.projectId,
      featureId: request.context.featureId,
      fromStage: request.context.currentStage,
      toStage: 'scoped',
      reason: 'Scope draft created and validated',
      correlationId: request.correlationId
    });

    return {
      success: true,
      command: request.command,
      fromStage: request.context.currentStage,
      toStage: 'scoped',
      artifactIds: [artifactResponse.id],
      artifact: draft,
      warnings: [],
      auditId: request.correlationId
    };
  }
}
```

The point is that stage advancement happens here, not inside the model prompt.

---

## Example command handler pattern

Each command gets its own handler with the same skeleton:

```ts
export interface CommandHandler<TInput = unknown, TArtifact = unknown> {
  canHandle(command: string): boolean;
  execute(request: CommandRequest<TInput>): Promise<CommandResult<TArtifact>>;
}
```

### `createspecs` outline

```ts
export interface SpecDraft {
  overview: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  testNotes: string[];
}
```

Flow:

1. Ensure current stage is `scoped`.
2. Load prior scope artifact.
3. Load repo rules and command spec.
4. Ask AI worker for structured `SpecDraft`.
5. Validate required sections.
6. Save artifact via API.
7. Move stage to `specified`.

---

## Audit trail

Every command should write a durable audit record.

```ts
export interface AuditRecord {
  correlationId: string;
  command: string;
  actorId: string;
  projectId: string;
  featureId: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage | null;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  warnings: string[];
  errorMessage?: string;
}
```

This matters because a non-expert user needs recoverability. If something fails, you want to know exactly what command ran, what stage it thought it was in, and where it stopped.

---

## Handoff bundle

Because your goal is continuity across users and agents, create a standard handoff bundle.

```ts
export interface HandoffBundle {
  featureId: string;
  currentStage: LifecycleStage;
  scopeArtifactId?: string;
  specArtifactId?: string;
  testTaskArtifactId?: string;
  implementationArtifactId?: string;
  summary: string;
  openQuestions: string[];
  nextRecommendedCommand?: string;
}
```

Store this after every major command so the next person can continue without reconstructing context from chat history.

---

## Optional MCP adapter

If you still want MCP support, keep it thin.

```ts
export async function runBuildScopeTool(args: {
  projectId: string;
  featureId: string;
  featureTitle: string;
  featureSummary: string;
}) {
  const context = await resolveProjectContext({
    projectId: args.projectId,
    featureId: args.featureId,
    transport: 'mcp'
  });

  return workflowEngine.runBuildScope({
    command: 'buildscope',
    context,
    input: {
      featureTitle: args.featureTitle,
      featureSummary: args.featureSummary
    },
    correlationId: crypto.randomUUID(),
    requestedAt: new Date().toISOString()
  });
}
```

This way, MCP is just a tool transport. It does not own lifecycle logic.

---

## What to build first

Start with **one vertical slice**:

1. `buildscope`
2. Project context resolver
3. Command policy engine
4. Lifecycle API wrapper
5. One AI worker
6. Audit logging

Get that working across two repos before implementing the rest.

---

## Practical rule set

Use these rules from day one:

- No lifecycle transition without orchestrator approval.
- No direct API writes from AI workers.
- No command execution without resolved project context.
- No stage change based only on prompt text.
- No silent fallback when `command.md` is missing or invalid.
- No repo-specific branching logic outside repo config and policy.

---

## Why this should help your portability issue

Right now the behavior likely changes by host, repo, and runtime path. This design makes every path go through the same pipeline:

- same context contract,
- same policy engine,
- same lifecycle API,
- same audit trail,
- same command handlers.

That is what makes “works in one project only” turn into “works anywhere that has a valid repo config.”

---

## Next expansion

Once this skeleton works, add:

- approval gates,
- retries and resumable workflows,
- richer parsed metadata from `command.md`,
- branch/worktree awareness,
- repo templates for onboarding new projects,
- per-command schema validation with Zod.

