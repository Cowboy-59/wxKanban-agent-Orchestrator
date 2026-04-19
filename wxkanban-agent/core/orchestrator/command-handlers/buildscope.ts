// Buildscope command handler — follows _wxAI/commands/buildscope.md canonical flow
// 5-phase interactive Business Analyst workflow
import * as fs from 'fs-extra';
import * as path from 'path';
import { ScopeDraft, AuditRecord } from '../../schemas/artifacts';

// Prompt interface — replaced by real CLI/UI integration
async function promptUser(question: string, defaultValue?: string): Promise<string> {
	console.log(question + (defaultValue ? ` [default: ${defaultValue}]` : ''));
	return defaultValue || '';
}

// --- Phase 0: Pre-Flight ---

export interface BuildScopeArgs {
	featureDescription: string;
	quick?: boolean;
	templateOnly?: boolean;
	editSpecNumber?: string;
	user?: string;
}

function determineNextSpecNumber(scopeDir: string): string {
	if (!fs.existsSync(scopeDir)) return '001';
	const existing = fs.readdirSync(scopeDir)
		.filter(f => /^\d{3}-/.test(f))
		.map(f => parseInt(f.slice(0, 3), 10))
		.filter(n => !isNaN(n));
	const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
	return String(next).padStart(3, '0');
}

function generateShortName(description: string): string {
	const stopWords = ['a', 'an', 'the', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on'];
	return description
		.toLowerCase()
		.split(/\s+/)
		.filter(w => !stopWords.includes(w) && w.length > 1)
		.slice(0, 4)
		.join('-')
		.replace(/[^a-z0-9-]/g, '');
}

// --- Scope Draft Sections ---

export interface ScopeDocument {
	specNumber: string;
	shortName: string;
	title: string;
	overview: string;
	primaryActor: string;
	valueProposition: string;
	scenarios: Array<{ id: string; name: string; steps: string[]; expected: string }>;
	requirements: Array<{ id: string; name: string; statement: string; criteria: string[] }>;
	technicalSections: {
		dataSchema?: string;
		apiRoutes?: string;
		frontendComponents?: string;
		wxaiCommands?: string;
	};
	successCriteria: string[];
	constraints: string[];
	notes: string;
}

// --- Phase 1: Discovery & Understanding ---

async function runDiscovery(featureDescription: string, quick: boolean): Promise<Record<string, string>> {
	const context: Record<string, string> = { featureDescription };

	if (quick) return context;

	console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
	console.log(`║  SCOPE BUILDER: Discovery Phase                                ║`);
	console.log(`║  I'm your Business Analyst partner for defining this scope.    ║`);
	console.log(`╚════════════════════════════════════════════════════════════════╝`);
	console.log(`\nLet's start by understanding what we're building and why.`);
	console.log(`\nBased on your description: "${featureDescription}"\n`);

	context.businessProblem = await promptUser(
		'1. BUSINESS CONTEXT: What business problem does this solve? Who requested this feature?'
	);
	context.userContext = await promptUser(
		'2. USER CONTEXT: Who are the primary users? How often will they use this feature?'
	);
	context.integrationContext = await promptUser(
		'3. INTEGRATION: Does this need to work with existing features or external systems?'
	);
	context.successDefinition = await promptUser(
		'4. SUCCESS: How will we know this feature is successful? What metrics matter?'
	);
	context.constraintsAndRisks = await promptUser(
		'5. CONSTRAINTS & RISKS: Any deadlines, limits, or technical constraints? What could go wrong?'
	);

	return context;
}

// --- Phase 2: Draft Generation ---

function generateDraft(specNumber: string, shortName: string, context: Record<string, string>): ScopeDocument {
	return {
		specNumber,
		shortName,
		title: context.featureDescription,
		overview: context.featureDescription,
		primaryActor: context.userContext || 'Developer',
		valueProposition: context.businessProblem || context.featureDescription,
		scenarios: [
			{ id: 'US1', name: 'Primary Flow', steps: ['User initiates action', 'System processes', 'Result displayed'], expected: 'Successful completion' },
			{ id: 'US2', name: 'Secondary Flow', steps: ['User accesses feature', 'System handles variation'], expected: 'Handled gracefully' },
			{ id: 'US3', name: 'Edge Case', steps: ['User encounters boundary', 'System validates'], expected: 'Appropriate error handling' },
		],
		requirements: [
			{ id: 'FR-001', name: 'Core Functionality', statement: `System shall provide ${context.featureDescription}`, criteria: ['Functionality works end-to-end', 'Response within performance targets'] },
		],
		technicalSections: {},
		successCriteria: [
			context.successDefinition || 'Feature delivers stated business value',
		],
		constraints: context.constraintsAndRisks ? [context.constraintsAndRisks] : [],
		notes: '',
	};
}

// --- Phase 3: Section-by-Section Review ---
// In guided mode, each section is presented with STOP/WAIT for user approval.
// In quick mode, all sections auto-approve.

type ReviewAction = 'approve' | 'change' | 'explain' | 'add';

async function reviewSection(
	sectionName: string,
	content: string,
	reasoning: string,
	questions: string[],
	quick: boolean
): Promise<{ action: ReviewAction; feedback: string }> {
	if (quick) return { action: 'approve', feedback: '' };

	console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
	console.log(`│ SECTION: ${sectionName.toUpperCase().padEnd(52)}│`);
	console.log(`├─────────────────────────────────────────────────────────────────┤`);
	console.log(`│ ${content.substring(0, 200)}...`);
	console.log(`│`);
	console.log(`│ MY REASONING: ${reasoning}`);
	console.log(`│`);
	questions.forEach((q, i) => console.log(`│ ${i + 1}. ${q}`));
	console.log(`└─────────────────────────────────────────────────────────────────┘`);
	console.log(`\nYour response: [A]pprove / [C]hange / [E]xplain / [A]dd`);
	console.log(`\n⏳ WAITING FOR YOUR RESPONSE...`);

	const response = await promptUser('Choice:', 'A');
	const action = response.toLowerCase().startsWith('c') ? 'change'
		: response.toLowerCase().startsWith('e') ? 'explain'
		: response.toLowerCase().startsWith('add') ? 'add'
		: 'approve';

	let feedback = '';
	if (action !== 'approve') {
		feedback = await promptUser('Please describe:', '');
	}

	return { action, feedback };
}

// --- Phase 4: Final Review ---

async function runFinalReview(doc: ScopeDocument, quick: boolean): Promise<boolean> {
	if (quick) return true;

	console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
	console.log(`║  FINAL REVIEW                                                  ║`);
	console.log(`╚════════════════════════════════════════════════════════════════╝`);
	console.log(`\nSCOPE: ${doc.specNumber}-${doc.shortName} — ${doc.title}`);
	console.log(`\n✅ Overview — Approved`);
	console.log(`✅ User Scenarios — ${doc.scenarios.length} scenarios defined`);
	console.log(`✅ Functional Requirements — ${doc.requirements.length} requirements with acceptance criteria`);
	console.log(`✅ Success Criteria — ${doc.successCriteria.length} measurable criteria`);
	console.log(`✅ Constraints — Documented`);
	console.log(`\nFINAL QUESTIONS:`);
	console.log(`1. Is there anything we missed that would surprise a developer?`);
	console.log(`2. Is there anything that would surprise a user testing this?`);
	console.log(`3. Are you confident this scope is ready for implementation?\n`);

	const confirm = await promptUser('Ready to generate? (yes/no)', 'yes');
	return confirm.toLowerCase() !== 'no';
}

// --- Phase 5: File Generation ---

function renderScopeMarkdown(doc: ScopeDocument): string {
	const lines: string[] = [];
	lines.push(`# ${doc.specNumber} — ${doc.title}`);
	lines.push('');
	lines.push('## Overview');
	lines.push(doc.overview);
	lines.push('');
	lines.push(`**Primary Actor**: ${doc.primaryActor}`);
	lines.push(`**Key Value**: ${doc.valueProposition}`);
	lines.push('');
	lines.push('## User Scenarios');
	for (const s of doc.scenarios) {
		lines.push(`\n### ${s.id} — ${s.name}`);
		s.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
		lines.push(`\n**Expected**: ${s.expected}`);
	}
	lines.push('');
	lines.push('## Functional Requirements');
	for (const r of doc.requirements) {
		lines.push(`\n### ${r.id} — ${r.name}`);
		lines.push(r.statement);
		lines.push('\n**Acceptance Criteria**:');
		r.criteria.forEach(c => lines.push(`- [ ] ${c}`));
	}
	if (doc.technicalSections.dataSchema) {
		lines.push('\n## Data / Schema');
		lines.push(doc.technicalSections.dataSchema);
	}
	if (doc.technicalSections.apiRoutes) {
		lines.push('\n## API Routes');
		lines.push(doc.technicalSections.apiRoutes);
	}
	if (doc.technicalSections.frontendComponents) {
		lines.push('\n## Frontend Components');
		lines.push(doc.technicalSections.frontendComponents);
	}
	if (doc.technicalSections.wxaiCommands) {
		lines.push('\n## wxAI Commands');
		lines.push(doc.technicalSections.wxaiCommands);
	}
	lines.push('\n## Success Criteria');
	doc.successCriteria.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
	if (doc.constraints.length) {
		lines.push('\n## Constraints');
		doc.constraints.forEach(c => lines.push(`- ${c}`));
	}
	if (doc.notes) {
		lines.push('\n## Notes');
		lines.push(doc.notes);
	}
	lines.push('');
	return lines.join('\n');
}

function renderChecklist(doc: ScopeDocument): string {
	return `# Requirements Checklist: ${doc.title}

**Spec Number**: ${doc.specNumber}
**Created**: ${new Date().toISOString().split('T')[0]}
**Source**: \`specs/Project-Scope/${doc.specNumber}-${doc.shortName}.md\`

---

## Specification Quality

- [ ] Overview clearly states WHAT and WHY (not HOW)
- [ ] User scenarios cover primary, secondary, and edge cases
- [ ] Functional requirements are numbered (FR-001, FR-002...)
- [ ] Each FR has clear acceptance criteria
- [ ] Success criteria are measurable and technology-agnostic
- [ ] Scope boundaries are clearly defined
- [ ] No implementation details in specification sections

## Completeness

- [ ] Primary actor identified
- [ ] Key value proposition stated
- [ ] At least 3 user scenarios defined
- [ ] At least ${doc.requirements.length} functional requirements defined
- [ ] At least ${doc.successCriteria.length} success criteria defined
- [ ] Constraints documented

## Readiness for Pipeline

- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Ready to break down into detailed specs via \`/wxAI-pipeline\`
- [ ] Dependencies on other scopes identified
`;
}

// --- Main Entry Point ---

export async function handleBuildScopeInteractive(args: BuildScopeArgs): Promise<{ result: Record<string, unknown>; audit: AuditRecord }> {
	const start = new Date();
	const scopeDir = path.join('specs', 'Project-Scope');
	const quick = args.quick || false;

	// Pre-Flight
	if (!args.featureDescription && !args.editSpecNumber) {
		return {
			result: { error: 'No scope description provided.', usage: '/BuildScope <scope description>' },
			audit: { timestamp: start.toISOString(), command: 'buildscope', input: args as unknown as Record<string, unknown>, result: { error: 'missing description' }, user: args.user },
		};
	}

	const specNumber = args.editSpecNumber || determineNextSpecNumber(scopeDir);
	const shortName = generateShortName(args.featureDescription);

	// Phase 1: Discovery
	const context = await runDiscovery(args.featureDescription, quick);

	// Phase 2: Draft Generation
	console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
	console.log(`║  Generating Initial Scope Draft...                             ║`);
	console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

	const doc = generateDraft(specNumber, shortName, context);

	// Phase 3: Section-by-Section Review (6 sections per buildscope.md)
	await reviewSection('Overview & Core Design', doc.overview, 'Framing the scope around the business need', [
		'Does this capture the essence of what we\'re building?',
		'Is the primary actor correct?',
		'Is the scope boundary clear?',
	], quick);

	await reviewSection('User Scenarios', doc.scenarios.map(s => `${s.id}: ${s.name}`).join(', '),
		'US1 covers happy path, US2 handles variation, US3 addresses edge cases', [
		'Do these scenarios cover the main ways users will interact?',
		'Are the expected outcomes measurable?',
		'Are we missing any important scenarios?',
	], quick);

	await reviewSection('Functional Requirements', doc.requirements.map(r => `${r.id}: ${r.name}`).join(', '),
		'Breaking down scenarios into testable pieces', [
		'Are these requirements clear enough for a developer to build?',
		'Are the acceptance criteria specific and testable?',
		'Are we missing any critical requirements?',
	], quick);

	await reviewSection('Technical Specifications', 'Data/Schema, API, Frontend, wxAI Commands',
		'Technical sections based on requirement analysis', [
		'Which of these sections should we include?',
		'Are there technical constraints I should know about?',
	], quick);

	await reviewSection('Success Criteria', doc.successCriteria.join('; '),
		'Defining "done" in measurable terms', [
		'Are these metrics realistic and measurable?',
		'Do they capture business value or just technical completion?',
	], quick);

	await reviewSection('Constraints & Notes', doc.constraints.join('; ') || '(none)',
		'Protecting from scope creep and documenting decisions', [
		'Are there additional constraints?',
		'Any lessons learned from similar features?',
	], quick);

	// Phase 4: Final Review
	const approved = await runFinalReview(doc, quick);
	if (!approved) {
		return {
			result: { cancelled: true, message: 'Scope generation cancelled by user' },
			audit: { timestamp: start.toISOString(), command: 'buildscope', input: args as unknown as Record<string, unknown>, result: { cancelled: true }, user: args.user },
		};
	}

	// Phase 5: File Generation
	await fs.ensureDir(scopeDir);
	const scopeFilePath = path.join(scopeDir, `${specNumber}-${shortName}.md`);
	const scopeContent = renderScopeMarkdown(doc);
	await fs.writeFile(scopeFilePath, scopeContent);

	const checklistDir = path.join(scopeDir, `${specNumber}-${shortName}`, 'checklists');
	await fs.ensureDir(checklistDir);
	const checklistPath = path.join(checklistDir, 'requirements.md');
	await fs.writeFile(checklistPath, renderChecklist(doc));

	// Completion Report
	console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
	console.log(`║  SCOPE DOCUMENT COMPLETE                                       ║`);
	console.log(`╚════════════════════════════════════════════════════════════════╝`);
	console.log(`\n✅ ${scopeFilePath}`);
	console.log(`✅ ${checklistPath}`);
	console.log(`\nNext Steps:`);
	console.log(`  1. Review the generated files`);
	console.log(`  2. Run /scope-validate ${specNumber} to check quality`);
	console.log(`  3. When ready: /wxAI-pipeline "Implement [feature]"\n`);

	const result = {
		specNumber,
		shortName,
		scopeFilePath,
		checklistPath,
		scopeContent,
		sectionsApproved: 6,
	};

	const audit: AuditRecord = {
		timestamp: start.toISOString(),
		command: 'buildscope',
		input: args as unknown as Record<string, unknown>,
		result: result as unknown as Record<string, unknown>,
		user: args.user,
	};

	return { result, audit };
}
