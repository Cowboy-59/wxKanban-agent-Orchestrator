// Command schemas
export interface CommandRequest<TInput> {
	command: string;
	input: TInput;
	context: any;
}

export interface CommandResult<TArtifact> {
	success: boolean;
	artifact?: TArtifact;
	error?: string;
}
