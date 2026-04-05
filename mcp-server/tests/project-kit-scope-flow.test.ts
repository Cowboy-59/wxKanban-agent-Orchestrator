import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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

  it('writes a scope once guided inputs meet the minimum quality bar', async () => {
    const result = await projectKit.buildScope({
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
    });

    expect(result.status).toBe('created');
    expect(result.canProceedToCreateSpecs).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(result.qualityScore).toBeGreaterThanOrEqual(80);

    const savedScope = readFileSync(join(workspaceRoot, result.filePath as string), 'utf8');
    const savedChecklist = readFileSync(join(workspaceRoot, result.checklistPath as string), 'utf8');
    const expectedScope = readFileSync(join(originalCwd, 'mcp-server', 'tests', 'fixtures', 'buildscope-rich-template.md'), 'utf8');

    expect(normalizeGolden(savedScope)).toBe(normalizeGolden(expectedScope));
    expect(savedScope).toContain('## Data Requirements');
    expect(savedScope).toContain('## API Routes');
    expect(savedScope).toContain('## Frontend Components');
    expect(savedScope).toContain('## Key Entities');
    expect(savedScope).toContain('## Clarifications');
    expect(savedScope).toContain('## User Scenarios & Testing');
    expect(savedScope).toContain('### FR-001');
    expect(savedScope).toContain('| **Secondary Actors** | Project manager, Finance lead |');
    expect(savedChecklist).toContain('**Validation Status**: valid');
    expect(savedChecklist).toContain('- [x] Scope clears the validatescope quality gate');
  });

  it('preserves quick mode as an explicit opt-in even when the scope is incomplete', async () => {
    const result = await projectKit.buildScope({
      featureDescription: 'Consulting billing automation',
      quick: true,
    });

    expect(result.mode).toBe('quick');
    expect(result.status).toBe('created');
    expect(result.filePath).toBeDefined();
    expect(result.canProceedToCreateSpecs).toBe(false);

    const savedScope = readFileSync(join(workspaceRoot, result.filePath as string), 'utf8');
    expect(savedScope).toContain('## Data Requirements');
    expect(savedScope).toContain('## Clarifications');
    expect(savedScope).toContain('This scope turns the requested capability into a business-ready flow');
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
    expect(result.placeholdersFound).toEqual(expect.arrayContaining(['TODO', 'TBD', 'NEEDS CLARIFICATION', 'placeholder']));
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

  it('refreshes the requirements checklist when validatescope is run against an existing scope file', async () => {
    const buildResult = await projectKit.buildScope({
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
    });

    const validation = await projectKit.validateScope({ specNumber: buildResult.specNumber });
    const checklist = readFileSync(join(workspaceRoot, buildResult.checklistPath as string), 'utf8');

    expect(validation.isValid).toBe(true);
    expect(checklist).toContain('**Validation Score**: 100');
    expect(checklist).toContain('- [x] At least 3 user scenarios defined');
    expect(checklist).toContain('- [x] At least 3 functional requirements defined');
  });
});