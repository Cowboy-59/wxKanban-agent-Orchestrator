// Command schemas
import { ProjectContext } from '../context/project-context';

export interface CommandRequest<TInput> {
	command: string;
	input: TInput;
	context: ProjectContext;
}

export interface CommandResult<TArtifact> {
	success: boolean;
	artifact?: TArtifact;
	error?: string;
}
