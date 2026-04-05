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
// Buildscope command handler
import { WorkflowEngine } from '../workflow-engine';
import { ProjectContext } from '../../context/project-context';
import { AuditRecord } from '../../schemas/artifacts';

export async function handleBuildScope(context: ProjectContext, input: any, user?: string): Promise<{ result: any; audit: AuditRecord }> {
	const start = new Date();
	let result, error;
	try {
		result = await WorkflowEngine.runBuildScope(context, input);
	} catch (e: any) {
		error = e.message || String(e);
	}
	const audit: AuditRecord = {
		timestamp: start.toISOString(),
		command: 'buildscope',
		input,
		result: error ? { error } : result,
		user,
	};
	return { result: error ? { error } : result, audit };
}
