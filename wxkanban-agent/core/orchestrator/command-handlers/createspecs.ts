// createSpecs command handler — follows _wxAI/commands/createSpecs.md canonical flow
// Orchestrates: capture → specify → clarify → plan → tasks → tests → lifecycle
import * as fs from 'fs-extra';
import * as path from 'path';
import { AuditRecord } from '../../schemas/artifacts';

export interface CreateSpecsArgs {
	specNumber: string;
	featureName: string;
	scopeContent: string;
	phase?: string;
	priority?: string;
	tasks?: Array<{ title: string; description: string; priority?: string; status?: string }>;
	generateLifecycle?: boolean;
	generateTests?: boolean;
	user?: string;
}

interface CreateSpecsResult {
	specNumber: string;
	featureName: string;
	specDir: string;
	filesCreated: string[];
	tasksCreated: number;
	testsGenerated: boolean;
	lifecycleGenerated: boolean;
}

// --- Phase 0: Capture Start Event ---

function logPhase(phase: string, message: string): void {
	console.log(`  [Phase ${phase}] ${message}`);
}

// --- Generate spec.md ---

function generateSpecMarkdown(args: CreateSpecsArgs): string {
	return `# Spec ${args.specNumber}: ${args.featureName}

## Overview

${args.scopeContent}

## Phase

**Current Phase**: ${args.phase || 'design'}
**Priority**: ${args.priority || 'medium'}

## Status

- **Date**: ${new Date().toISOString().split('T')[0]}
- **Phase**: ${args.phase || 'design'}
`;
}

// --- Generate plan.md ---

function generatePlanMarkdown(args: CreateSpecsArgs): string {
	const lines: string[] = [];
	lines.push(`# Plan: ${args.featureName}`);
	lines.push('');
	lines.push(`**Spec Number**: ${args.specNumber}`);
	lines.push(`**Date**: ${new Date().toISOString().split('T')[0]}`);
	lines.push('');
	lines.push('## Implementation Plan');
	lines.push('');
	lines.push('### Phase 1: Setup');
	lines.push('- Review spec and data model');
	lines.push('- Identify dependencies');
	lines.push('');
	lines.push('### Phase 2: Core Implementation');
	lines.push('- Implement core functionality');
	lines.push('- Write unit tests');
	lines.push('');
	lines.push('### Phase 3: Integration');
	lines.push('- Integration testing');
	lines.push('- Documentation');
	lines.push('');
	lines.push('## Known Issues');
	lines.push('');
	lines.push('_None at this time._');
	lines.push('');
	return lines.join('\n');
}

// --- Generate tasks.md ---

function generateTasksMarkdown(args: CreateSpecsArgs): string {
	const lines: string[] = [];
	lines.push(`# Task Breakdown: ${args.featureName}`);
	lines.push('');
	lines.push(`**Feature**: ${args.featureName}`);
	lines.push(`**Spec**: ${args.specNumber}`);
	lines.push(`**Date Generated**: ${new Date().toISOString().split('T')[0]}`);
	lines.push(`**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)`);
	lines.push('');
	lines.push('---');
	lines.push('');

	if (args.tasks && args.tasks.length > 0) {
		lines.push('## Tasks');
		lines.push('');
		lines.push('| # | Task | Priority | Status |');
		lines.push('|---|------|----------|--------|');
		args.tasks.forEach((t, i) => {
			lines.push(`| ${i + 1} | ${t.title} | ${t.priority || 'medium'} | ${t.status || 'todo'} |`);
		});
		lines.push('');
		lines.push('## Task Details');
		lines.push('');
		args.tasks.forEach((t, i) => {
			lines.push(`### T${String(i + 1).padStart(3, '0')} — ${t.title}`);
			lines.push('');
			lines.push(t.description);
			lines.push('');
		});
	} else {
		lines.push('## Tasks');
		lines.push('');
		lines.push('_No tasks generated yet. Add tasks based on spec requirements._');
		lines.push('');
	}

	return lines.join('\n');
}

// --- Generate tests.md ---

function generateTestsMarkdown(args: CreateSpecsArgs): string {
	const lines: string[] = [];
	lines.push(`# Test Plan: ${args.featureName}`);
	lines.push('');
	lines.push(`**Spec Number**: ${args.specNumber}`);
	lines.push(`**Date Generated**: ${new Date().toISOString().split('T')[0]}`);
	lines.push(`**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)`);
	lines.push('');
	lines.push('---');
	lines.push('');
	lines.push('## Test Strategy');
	lines.push('');
	lines.push('| Layer | Framework | Coverage Target |');
	lines.push('|-------|-----------|-----------------|');
	lines.push('| Unit | Vitest | Core logic, services, utilities |');
	lines.push('| Integration | Vitest + Supertest | API endpoints, DB operations |');
	lines.push('| E2E | Playwright | User workflows, critical paths |');
	lines.push('');
	lines.push('---');
	lines.push('');
	lines.push('## Unit Tests');
	lines.push('');

	// Generate test cases from tasks if available
	if (args.tasks && args.tasks.length > 0) {
		args.tasks.forEach((t, i) => {
			lines.push(`### UT-${String(i + 1).padStart(3, '0')} — ${t.title}`);
			lines.push('');
			lines.push(`**Linked Task**: T${String(i + 1).padStart(3, '0')}`);
			lines.push(`**Status**: pending`);
			lines.push('');
			lines.push('| # | Test Case | Expected | Status |');
			lines.push('|---|-----------|----------|--------|');
			lines.push(`| 1 | ${t.title} — happy path | Success response | pending |`);
			lines.push(`| 2 | ${t.title} — validation error | Error with details | pending |`);
			lines.push(`| 3 | ${t.title} — edge case | Graceful handling | pending |`);
			lines.push('');
		});
	} else {
		lines.push('_Generate tasks first, then test cases will be derived from them._');
		lines.push('');
	}

	lines.push('## Integration Tests');
	lines.push('');
	lines.push('| # | Scenario | Endpoint/Flow | Expected | Status |');
	lines.push('|---|----------|--------------|----------|--------|');
	lines.push(`| 1 | Full ${args.featureName} workflow | End-to-end | All steps succeed | pending |`);
	lines.push(`| 2 | Error handling | Error paths | Proper error responses | pending |`);
	lines.push(`| 3 | Auth/permissions | Protected routes | 401/403 as expected | pending |`);
	lines.push('');
	lines.push('## E2E Tests');
	lines.push('');
	lines.push('| # | User Story | Steps | Expected | Status |');
	lines.push('|---|-----------|-------|----------|--------|');
	lines.push(`| 1 | Primary flow | User completes ${args.featureName} | Success | pending |`);
	lines.push(`| 2 | Error recovery | User encounters and recovers from error | Guided recovery | pending |`);
	lines.push('');
	lines.push('## Test Automation');
	lines.push('');
	lines.push('```bash');
	lines.push('# Run unit tests');
	lines.push('npm run test');
	lines.push('');
	lines.push('# Run integration tests');
	lines.push('npm run test:integration');
	lines.push('');
	lines.push('# Run E2E tests');
	lines.push('npm run test:e2e');
	lines.push('```');
	lines.push('');
	lines.push('## Coverage Requirements');
	lines.push('');
	lines.push('- Unit test coverage: >= 80%');
	lines.push('- All acceptance criteria from spec must have at least one test');
	lines.push('- All API endpoints must have integration tests');
	lines.push('- Critical user flows must have E2E tests');
	lines.push('');

	return lines.join('\n');
}

// --- Generate lifecycle.json ---

function generateLifecycleJson(args: CreateSpecsArgs): string {
	return JSON.stringify({
		specNumber: args.specNumber,
		featureName: args.featureName,
		phase: args.phase || 'design',
		priority: args.priority || 'medium',
		progress: {
			tasksTotal: args.tasks?.length || 0,
			tasksCompleted: 0,
			percentage: 0,
		},
		timeline: {
			created: new Date().toISOString(),
			phaseStarted: new Date().toISOString(),
		},
	}, null, 2);
}

// --- Generate quickstart.md ---

function generateQuickstartMarkdown(args: CreateSpecsArgs): string {
	return `# Quickstart: ${args.featureName}

**Spec Number**: ${args.specNumber}

## Setup

1. Review the spec: \`specs/${args.specNumber}-${args.featureName.toLowerCase().replace(/\s+/g, '-')}/spec.md\`
2. Review the plan: \`plan.md\`
3. Review tasks: \`tasks.md\`
4. Review tests: \`tests.md\`

## Development

1. Pick a task from \`tasks.md\`
2. Implement the feature
3. Write tests per \`tests.md\`
4. Run tests: \`npm run test\`
5. Mark task done: \`/task-done <task-id>\`

## Verification

1. Run \`/scope-validate ${args.specNumber}\` to check spec quality
2. Run tests to verify implementation
3. Review test coverage against \`tests.md\` requirements
`;
}

// --- Generate checklists/requirements.md ---

function generateChecklistMarkdown(args: CreateSpecsArgs): string {
	return `# Requirements Checklist: ${args.featureName}

**Spec Number**: ${args.specNumber}
**Created**: ${new Date().toISOString().split('T')[0]}

---

## Specification Quality

- [ ] Spec.md reviewed and complete
- [ ] Plan.md has clear implementation phases
- [ ] Tasks.md generated with all work items
- [ ] Tests.md has test cases for all tasks
- [ ] Lifecycle.json tracking initialized

## Implementation Readiness

- [ ] All dependencies identified
- [ ] No blocking issues
- [ ] Ready for implementation phase

## Test Coverage

- [ ] Unit tests defined for all tasks
- [ ] Integration tests defined for workflows
- [ ] E2E tests defined for user stories
`;
}

// --- Main Entry Point ---

export async function handleCreateSpecs(args: CreateSpecsArgs): Promise<{ result: Record<string, unknown>; audit: AuditRecord }> {
	const start = new Date();
	const generateTests = args.generateTests !== false; // default true
	const generateLifecycle = args.generateLifecycle !== false; // default true

	console.log(`\ncreatSpecs Report (MCP Project Hub — project.create_specs)`);
	console.log(`===========================================================`);
	console.log(`Spec Number:  ${args.specNumber}`);
	console.log(`Feature:      ${args.featureName}`);
	console.log(`Phase:        ${args.phase || 'design'}\n`);

	// Determine spec directory name
	const dirName = `${args.specNumber}-${args.featureName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
	const specDir = path.join('specs', dirName);
	await fs.ensureDir(specDir);

	const filesCreated: string[] = [];

	// Phase 0: Capture Start Event
	logPhase('0', 'Capturing pipeline start event');

	// Phase 1-3: Specify, Clarify, Plan
	logPhase('1-3', 'Processing scope content');

	// Phase 4: Create Documents
	logPhase('4', 'Creating documents');

	const specPath = path.join(specDir, 'spec.md');
	await fs.writeFile(specPath, generateSpecMarkdown(args));
	filesCreated.push(specPath);
	console.log(`  ✅ spec.md — "Spec ${args.specNumber}: ${args.featureName}"`);

	const planPath = path.join(specDir, 'plan.md');
	await fs.writeFile(planPath, generatePlanMarkdown(args));
	filesCreated.push(planPath);
	console.log(`  ✅ plan.md — "Plan: ${args.featureName}"`);

	// Phase 5: Create Tasks
	logPhase('5', 'Creating tasks');

	const tasksPath = path.join(specDir, 'tasks.md');
	await fs.writeFile(tasksPath, generateTasksMarkdown(args));
	filesCreated.push(tasksPath);
	console.log(`  ✅ tasks.md — ${args.tasks?.length || 0} tasks created`);

	// Phase 5.5: Generate Tests (NEW — tests.md for every spec)
	logPhase('5.5', 'Generating test plan');

	if (generateTests) {
		const testsPath = path.join(specDir, 'tests.md');
		await fs.writeFile(testsPath, generateTestsMarkdown(args));
		filesCreated.push(testsPath);
		console.log(`  ✅ tests.md — Test plan generated with ${(args.tasks?.length || 0) * 3} test cases`);
	}

	// Phase 6: Generate Lifecycle
	logPhase('6', 'Generating lifecycle');

	let lifecycleGenerated = false;
	if (generateLifecycle) {
		const lifecyclePath = path.join(specDir, 'lifecycle.json');
		await fs.writeFile(lifecyclePath, generateLifecycleJson(args));
		filesCreated.push(lifecyclePath);
		lifecycleGenerated = true;
		console.log(`  ✅ lifecycle.json — Phase tracking initialized`);
	}

	// Generate quickstart
	const quickstartPath = path.join(specDir, 'quickstart.md');
	await fs.writeFile(quickstartPath, generateQuickstartMarkdown(args));
	filesCreated.push(quickstartPath);
	console.log(`  ✅ quickstart.md — Developer quickstart`);

	// Generate checklist
	const checklistDir = path.join(specDir, 'checklists');
	await fs.ensureDir(checklistDir);
	const checklistPath = path.join(checklistDir, 'requirements.md');
	await fs.writeFile(checklistPath, generateChecklistMarkdown(args));
	filesCreated.push(checklistPath);
	console.log(`  ✅ checklists/requirements.md — Quality checklist`);

	// Phase 7: Capture Completion
	logPhase('7', 'Pipeline complete');

	// Completion Report
	console.log(`\n✅ Pipeline Complete`);
	console.log(`\nFiles Created:`);
	filesCreated.forEach(f => console.log(`  ✅ ${f}`));
	console.log(`\nNext Steps:`);
	console.log(`  1. Review generated artifacts`);
	console.log(`  2. Run \`task-push ${args.specNumber}\` to sync tasks`);
	console.log(`  3. Begin implementation (Phase 2)`);
	console.log(`  4. Run tests per tests.md\n`);

	const result: CreateSpecsResult = {
		specNumber: args.specNumber,
		featureName: args.featureName,
		specDir,
		filesCreated,
		tasksCreated: args.tasks?.length || 0,
		testsGenerated: generateTests,
		lifecycleGenerated,
	};

	const audit: AuditRecord = {
		timestamp: start.toISOString(),
		command: 'createspecs',
		input: { specNumber: args.specNumber, featureName: args.featureName, phase: args.phase || 'design' },
		result: result as unknown as Record<string, unknown>,
		user: args.user,
	};

	return { result: result as unknown as Record<string, unknown>, audit };
}
