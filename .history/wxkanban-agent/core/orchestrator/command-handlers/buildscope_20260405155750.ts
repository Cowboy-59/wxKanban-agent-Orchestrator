// Minimal test (can be moved to a test file)
if (require.main === module) {
	(async () => {
		const context = {
			projectName: 'Demo',
			description: 'Demo project',
			lifecycleStage: 'Design',
			features: [],
			artifacts: [],
		};
		const input = {
			title: 'Sample Feature',
			problemStatement: 'Demo problem',
			objectives: ['Demo objective'],
		};
		const { result, audit } = await handleBuildScope(context, input, 'test-user');
		console.log('Result:', result);
		console.log('Audit:', audit);
	})();
}
// Buildscope command handler (interactive Q&A, direct file edit, logging, post-action prompt)
import * as fs from 'fs-extra';
import * as path from 'path';
import { ScopeDraft, AuditRecord } from '../../schemas/artifacts';

// Simulate a prompt/response loop (replace with real UI or CLI integration as needed)
async function promptUser(question: string, defaultValue?: string): Promise<string> {
  // Placeholder: Replace with actual prompt logic
  console.log(question + (defaultValue ? ` [default: ${defaultValue}]` : ''));
  return defaultValue || '';
}

function validateScopeDraft(draft: Partial<ScopeDraft>): string[] {
  const errors = [];
  if (!draft.title) errors.push('Title is required.');
  if (!draft.problemStatement) errors.push('Problem statement is required.');
  if (!Array.isArray(draft.objectives) || !draft.objectives.length) errors.push('At least one objective is required.');
  return errors;
}

export async function handleBuildScopeInteractive({
  nnn,
  filename,
  initialDraft = {},
  user = 'unknown',
  quick = false,
}: {
  nnn: string;
  filename: string;
  initialDraft?: Partial<ScopeDraft>;
  user?: string;
  quick?: boolean;
}): Promise<{ result: any; audit: AuditRecord }> {
  const start = new Date();
  let draft: Partial<ScopeDraft> = { ...initialDraft };
  const log: string[] = [];

  // Interactive Q&A loop (skip if quick mode)
  if (!quick) {
    // Title
    if (!draft.title) {
      draft.title = await promptUser('What is the title of this scope?');
      log.push(`Asked for title: ${draft.title}`);
    }
    // Problem Statement
    if (!draft.problemStatement) {
      draft.problemStatement = await promptUser('What business problem does this solve?');
      log.push(`Asked for problemStatement: ${draft.problemStatement}`);
    }
    // Objectives
    if (!Array.isArray(draft.objectives) || !draft.objectives.length) {
      const obj = await promptUser('List the main objectives (comma separated):');
      draft.objectives = obj.split(',').map(s => s.trim()).filter(Boolean);
      log.push(`Asked for objectives: ${draft.objectives.join('; ')}`);
    }
    // Constraints (optional)
    if (!Array.isArray(draft.constraints)) {
      const cons = await promptUser('Any constraints? (comma separated, optional):');
      draft.constraints = cons ? cons.split(',').map(s => s.trim()).filter(Boolean) : [];
      log.push(`Asked for constraints: ${draft.constraints.join('; ')}`);
    }
    // Acceptance Criteria (optional)
    if (!Array.isArray(draft.acceptanceCriteria)) {
      const acc = await promptUser('Acceptance criteria? (comma separated, optional):');
      draft.acceptanceCriteria = acc ? acc.split(',').map(s => s.trim()).filter(Boolean) : [];
      log.push(`Asked for acceptanceCriteria: ${draft.acceptanceCriteria.join('; ')}`);
    }
    // Notes (optional)
    if (!draft.notes) {
      draft.notes = await promptUser('Any additional notes? (optional):');
      log.push(`Asked for notes: ${draft.notes}`);
    }
  }

  // Validate
  const errors = validateScopeDraft(draft);
  if (errors.length) {
    log.push('Validation errors: ' + errors.join('; '));
    return {
      result: { error: 'Validation failed', details: errors },
      audit: {
        timestamp: start.toISOString(),
        command: 'buildscope',
        input: draft,
        result: { error: 'Validation failed', details: errors },
        user,
      },
    };
  }

  // Write or update the scope file
  const scopeDir = path.join('specs', 'Project-Scope');
  await fs.ensureDir(scopeDir);
  const filePath = path.join(scopeDir, `${nnn}-${filename}.md`);
  const content = `# ${draft.title}

## Problem Statement
${draft.problemStatement}

## Objectives
${Array.isArray(draft.objectives) ? draft.objectives.map(o => `- ${o}`).join('\n') : ''}

${Array.isArray(draft.constraints) && draft.constraints.length ? '## Constraints\n' + draft.constraints.map(c => `- ${c}`).join('\n') + '\n' : ''}${Array.isArray(draft.acceptanceCriteria) && draft.acceptanceCriteria.length ? '## Acceptance Criteria\n' + draft.acceptanceCriteria.map(a => `- ${a}`).join('\n') + '\n' : ''}${draft.notes ? '## Notes\n' + draft.notes + '\n' : ''}`;
  await fs.writeFile(filePath, content);
  log.push(`Wrote scope file: ${filePath}`);

  // Post-action prompt (simulate)
  const postAction = await promptUser('Do you want to update specs and sync the wxKanban database with these changes? (yes/no)', 'no');
  log.push(`Post-action prompt: ${postAction}`);
  // (Here you would trigger downstream actions if postAction === 'yes')

  // Log everything
  const audit: AuditRecord = {
    timestamp: start.toISOString(),
    command: 'buildscope',
    input: draft,
    result: { filePath, content, postAction },
    user,
  };
  // Optionally, write log to a file or system log
  await fs.appendFile('buildscope-audit.log', log.join('\n') + '\n');

  return { result: { filePath, content, postAction }, audit };
}
