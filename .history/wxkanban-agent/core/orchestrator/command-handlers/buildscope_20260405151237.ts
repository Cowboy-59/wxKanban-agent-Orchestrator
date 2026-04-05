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
