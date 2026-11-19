import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

type ProjectKitModule = typeof import('../src/utils/project-kit.js');

const COMPLETE_SCOPE = `# Spec 001: Billing Automation

## Overview
Billing automation streamlines how consultants capture and review billable time before invoicing.

## Business Problem
Consulting leads currently reconcile time entries across three spreadsheets, which delays invoices and causes missed billable hours every month.

## Actors
- Primary: Consulting operations manager
- Secondary: Project manager, Finance lead

## Success Metrics
- 95% of invoices are generated in under 5 minutes after the billing period closes.
- Missed billable hours drop by 25% within 30 days of rollout.
- The system supports 50 concurrent timer sessions with less than 1% sync error rate.

## Scope Boundary
Include time-entry review, approval routing, and invoice-ready export for consulting projects.

## Out of Scope
Do not add payment collection, tax calculation, or ERP synchronization in this scope.

## Open Questions
- None currently.
`;

function normalizeGolden(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/(\*\*Created\*\*: )\d{4}-\d{2}-\d{2}/g, '$1YYYY-MM-DD')
    .replace(/(### Session )\d{4}-\d{2}-\d{2}/g, '$1YYYY-MM-DD')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PLACEHOLDER_SCOPE = `# Spec 001: Placeholder Scope

## Overview
Placeholder overview.

## Business Problem
TODO: Define the business problem.

## Actors
- Primary: TODO
- Secondary: TBD

## Success Metrics
- TODO: Add metric one.
- TODO: Add metric two.
- TODO: Add metric three.

## Scope Boundary
placeholder

## Out of Scope
NEEDS CLARIFICATION

## Open Questions
- TODO
`;

// [SCOPE 135 / T013] The interview's full output, as buildscope now accepts it. Before SCOPE-135 the
// requirements and technical sections had no input at all, so no call could produce a draft that
// cleared buildscope's own gate.
const RICH_INPUT = {
  featureDescription: 'Consulting billing automation',
  businessProblem: 'Project leads lose revenue because billable time is reconciled manually across disconnected tools every week.',
  primaryActor: 'Consulting operations manager',
  secondaryActors: ['Project manager', 'Finance lead'],
  successMetrics: [
    '95% of invoice-ready exports complete in under 5 minutes.',
    'Missed billable hours drop by 25% within 30 days.',
    'The review workflow supports 50 concurrent sessions with less than 1% error rate.',
  ],
  scopeBoundary: 'Include time-entry review, approval routing, and invoice-ready export for consulting projects.',
  outOfScope: 'Exclude payment collection, tax handling, and ERP integration from this scope.',
  integrationContext: 'Align with the existing invoicing workflow, finance review process, and current project lifecycle reporting.',
  constraintsAndRisks: 'Finance needs the first usable draft before the next billing cycle, and upstream billing codes must stay stable during rollout.',
  functionalRequirements: [
    {
      title: 'Review time entries before export',
      requirement: 'The system MUST let the operations manager approve or return each week of time entries before it is exported.',
      acceptanceCriteria: ['A returned week shows the reason to the consultant.', 'Only approved weeks appear in the export.'],
    },
    {
      title: 'Route approvals to the project manager',
      requirement: 'The system MUST route each project\'s time entries to that project\'s manager for approval.',
      acceptanceCriteria: ['A project with no manager is flagged before routing.'],
    },
    {
      title: 'Produce an invoice-ready export',
      requirement: 'The system MUST produce one export per billing period in the finance team\'s import format.',
      acceptanceCriteria: ['The export totals match the approved hours to the cent.'],
    },
  ],
  userScenarios: [
    {
      title: 'Manager approves a week',
      actor: 'Consulting operations manager',
      steps: ['Opens the week under review.', 'Approves every entry.'],
      expectedOutcome: 'The week is marked approved and included in the next export.',
    },
    {
      title: 'Finance imports the export',
      actor: 'Finance lead',
      steps: ['Downloads the period export.', 'Imports it into the invoicing tool.'],
      expectedOutcome: 'Invoices are created without manual edits.',
    },
    {
      title: 'A project has no manager',
      actor: 'Consulting operations manager',
      steps: ['Starts routing for the period.'],
      expectedOutcome: 'The project is flagged and routing waits for a manager to be assigned.',
    },
  ],
  dataRequirements: '| Table | Change |\n|---|---|\n| `timeentryapprovals` | new — one row per approved week |',
  apiRoutes: '| Method | Path | Purpose |\n|---|---|---|\n| POST | `/api/time-approvals/:weekId` | Approve or return a week |',
  frontendComponents: 'None',
  keyEntities: 'None — no new domain entity; approvals extend time entries.',
};

describe.sequential('project kit scope flow', () => {
  let originalCwd = '';
  let workspaceRoot = '';
  let projectKit: ProjectKitModule;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workspaceRoot = mkdtempSync(join(tmpdir(), 'wxk-scope-flow-'));
    process.env.WXKANBAN_MCP_DATABASE_URL = 'postgresql://test:test@localhost:5432/wxkanban';
    process.env.API_KEY = 'test-api-key';
    vi.resetModules();
    projectKit = await import('../src/utils/project-kit.js');
    process.chdir(workspaceRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.WXKANBAN_MCP_DATABASE_URL;
    delete process.env.API_KEY;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns guided questions and does not write a placeholder scope by default', async () => {
    const result = await projectKit.buildScope({
      featureDescription: 'Consulting billing automation',
    });

    expect(result.mode).toBe('guided');
    expect(result.status).toBe('draft_interview');
    expect(result.canProceedToCreateSpecs).toBe(false);
    expect(result.questions.map((question) => question.field)).toEqual(expect.arrayContaining([
      'businessProblem',
      'primaryActor',
      'secondaryActors',
      'successMetrics',
      'scopeBoundary',
      'outOfScope',
    ]));
    expect(result.filePath).toBeUndefined();
    expect(existsSync(join(workspaceRoot, 'specs', 'Project-Scope'))).toBe(false);
  });

  it('returns a draft, and writes nothing, once guided inputs meet the minimum quality bar', async () => {
    const result = await projectKit.buildScope(RICH_INPUT);

    expect(result.status).toBe('drafted');
    expect(result.persisted).toBe(false);
    // [SCOPE 135 / T013] The day SCOPE-124 T020 promised: with the requirements and the four
    // technical sections now accepted as inputs, buildscope's own output clears its own gate.
    // Before SCOPE-135 this asserted `false` because those sections could only be placeholders.
    expect(result.canProceedToCreateSpecs).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.missingInputs).toBeUndefined();
    expect(result.filePath).toBeDefined();
    expect(result.suggestedFilePath).toBe(result.filePath);
    expect(result.suggestedChecklistPath).toBe(result.checklistPath);
    expect(result.qualityScore).toBeGreaterThanOrEqual(80);

    // [SCOPE 124 / T020] The draft IS the response. Nothing may reach the workspace — on the hosted
    // MCP a server-side write lands on the wrong host entirely (SCOPE-028 Phase 12) — and the
    // response must not claim otherwise, which is field report 7dfc7c13.
    expect(existsSync(join(workspaceRoot, 'specs', 'Project-Scope'))).toBe(false);
    expect(result.message).toContain('drafted');
    expect(result.message).toContain('Nothing has been written or stored');
    expect(result.message).not.toContain('created');
    expect(result.nextSteps[0]).toContain('Write scopeContent to');

    const savedScope = result.scopeContent as string;
    const savedChecklist = result.checklistContent as string;

    expect(savedScope).toContain('## Data Requirements');
    expect(savedScope).toContain('## API Routes');
    expect(savedScope).toContain('## Frontend Components');
    expect(savedScope).toContain('## Key Entities');
    expect(savedScope).toContain('## Clarifications');
    expect(savedScope).toContain('## User Scenarios & Testing');
    expect(savedScope).toContain('### FR-001 — Review time entries before export');
    expect(savedScope).toContain('### US3 — A project has no manager');
    expect(savedScope).toContain('None — not affected by this scope.');
    expect(savedScope).toContain('None — no new domain entity; approvals extend time entries.');
    expect(savedScope).toContain('| **Secondary Actors** | Project manager, Finance lead |');
    expect(savedScope).not.toContain('NEEDS CLARIFICATION');
    // The checklist reports the verdict the scope actually earned.
    expect(savedChecklist).toContain('**Validation Status**: valid');
  });

  // [SCOPE 135 / T013] FR-010 — un-skipped. The golden was stale because the generator had moved on
  // from it; it is regenerated from RICH_INPUT and now pins the SCOPE-135 output byte for byte
  // (dates normalized). Regenerate it deliberately when the generator changes on purpose.
  it('matches the golden rich template byte for byte', async () => {
    const result = await projectKit.buildScope(RICH_INPUT);

    const fixturePath = fileURLToPath(new URL('./fixtures/buildscope-rich-template.md', import.meta.url));
    const expectedScope = readFileSync(fixturePath, 'utf8');
    expect(normalizeGolden(result.scopeContent as string)).toBe(normalizeGolden(expectedScope));
  });

  it('preserves quick mode as an explicit opt-in even when the scope is incomplete', async () => {
    const result = await projectKit.buildScope({
      featureDescription: 'Consulting billing automation',
      quick: true,
    });

    expect(result.mode).toBe('quick');
    expect(result.status).toBe('drafted');
    expect(result.persisted).toBe(false);
    expect(result.filePath).toBeDefined();
    expect(result.canProceedToCreateSpecs).toBe(false);
    expect(existsSync(join(workspaceRoot, 'specs', 'Project-Scope'))).toBe(false);

    const savedScope = result.scopeContent as string;
    expect(savedScope).toContain('## Data Requirements');
    expect(savedScope).toContain('## Clarifications');
    expect(savedScope).toContain('This scope turns the requested capability into a business-ready flow');
    // [SCOPE 135 / T013] FR-004 / FR-005 — quick mode drafts honestly: no filler, every omitted
    // input named, and the draft blocked until they are supplied.
    expect(savedScope).not.toContain('Primary workflow support');
    expect(savedScope).not.toMatch(/### US\d/);
    expect(result.missingInputs).toEqual([
      'functionalRequirements', 'userScenarios', 'dataRequirements', 'apiRoutes', 'frontendComponents', 'keyEntities',
    ]);
    expect(result.nextSteps.join(' ')).toContain('Supply functionalRequirements, userScenarios, dataRequirements, apiRoutes, frontendComponents, keyEntities');
  });
});

describe('scope validation quality gates', () => {
  let projectKit: ProjectKitModule;
  let originalCwd = '';
  let workspaceRoot = '';

  beforeEach(async () => {
    originalCwd = process.cwd();
    workspaceRoot = mkdtempSync(join(tmpdir(), 'wxk-scope-validate-'));
    process.env.WXKANBAN_MCP_DATABASE_URL = 'postgresql://test:test@localhost:5432/wxkanban';
    process.env.API_KEY = 'test-api-key';
    vi.resetModules();
    projectKit = await import('../src/utils/project-kit.js');
    process.chdir(workspaceRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.WXKANBAN_MCP_DATABASE_URL;
    delete process.env.API_KEY;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('fails a scope that has the required headers but still contains placeholders', () => {
    const result = projectKit.validateScopeContent(PLACEHOLDER_SCOPE);

    expect(result.status).toBe('invalid');
    expect(result.isValid).toBe(false);
    // [SCOPE 135 / T013] 'placeholder' dropped from this list: SCOPE-124 T010 made marker detection
    // judge content rather than the English word, so a bare lowercase "placeholder" line no longer
    // counts as a marker. The expectation had been stale (failing) since that change.
    expect(result.placeholdersFound).toEqual(expect.arrayContaining(['TODO', 'TBD', 'NEEDS CLARIFICATION']));
    expect(result.minimumCriteriaStatus.noPlaceholders).toBe(false);
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.stringContaining('Placeholder markers found'),
      'Business Problem must be specific and non-placeholder.',
      'Success Metrics must include at least 3 measurable outcomes.',
    ]));
  });

  it('passes a fully specified scope with measurable metrics', () => {
    const result = projectKit.validateScopeContent(COMPLETE_SCOPE);

    expect(result.status).toBe('valid');
    expect(result.isValid).toBe(true);
    expect(result.placeholdersFound).toEqual([]);
    expect(result.minimumCriteriaStatus.measurableSuccessMetrics).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('passes the real 023-style scope shape with Core Design + Clarifications', () => {
    const realScope = readFileSync(join(originalCwd, 'specs', 'Project-Scope', '023-stripe-subscription-operations.md'), 'utf8');
    const result = projectKit.validateScopeContent(realScope);

    expect(result.status).toBe('valid');
    expect(result.isValid).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('blocks create_specs preflight and returns explicit blockers for invalid scope content', () => {
    const result = projectKit.createSpecsPreflight(PLACEHOLDER_SCOPE);

    expect(result.isValid).toBe(false);
    expect(result.message).toContain('failed one or more quality gates');
    expect(result.blockingIssues.length).toBeGreaterThan(0);
    expect(result.placeholdersFound).toContain('TODO');
  });

  // [SCOPE 124 / T020] Was 'refreshes the requirements checklist when validatescope is run against
  // an existing scope file' — it called buildScope and then read a checklist off disk, which no
  // server-side path has written since SCOPE-028 Phase 12 removed the write. Same false assumption
  // as the response wording field report 7dfc7c13 reported, so it is corrected here: the client
  // writes what buildscope returns, and validate refreshes nothing.
  it('returns a checklist carrying the verdict and leaves writing it to the client', async () => {
    const buildResult = await projectKit.buildScope(RICH_INPUT);

    // The client is what puts the draft on disk — buildscope-worker.ts does exactly this in the
    // CLI. Without it there is nothing on disk and nothing in the DB, so the lookup below could not
    // resolve at all: precisely what the reporter hit after being told the scope was "created".
    const scopeAbsolute = join(workspaceRoot, buildResult.filePath as string);
    mkdirSync(dirname(scopeAbsolute), { recursive: true });
    writeFileSync(scopeAbsolute, buildResult.scopeContent as string, 'utf8');

    const validation = await projectKit.validateScope({ specNumber: buildResult.specNumber });
    const checklist = buildResult.checklistContent as string;

    expect(validation.score).toBeGreaterThanOrEqual(80);
    expect(checklist).toContain('**Validation Score**:');
    // [SCOPE 135 / T010] Gate and Advisory are separate groups; this scope satisfies both.
    expect(checklist).toContain('## Gate — blocks create_specs');
    expect(checklist).toContain('## Advisory — not enforced by the gate');
    expect(checklist).toContain('- [x] At least 3 user scenarios defined (primary, secondary, edge case)');
    expect(checklist).toContain('- [x] At least 3 functional requirements defined (FR-001, FR-002...)');
    expect(checklist).toContain('- [x] Scope clears the validatescope / create_specs quality gate');
    // Validate writes nothing either — no checklist appears on disk for having run it.
    expect(existsSync(join(workspaceRoot, buildResult.checklistPath as string))).toBe(false);
  });
});