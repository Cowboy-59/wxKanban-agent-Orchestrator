// MCP server adapter — registers orchestrator commands as MCP tools (R3)
import { WorkflowEngine } from '../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../core/context/project-context';
import { LifecycleStage, AllowedCommandsByStage, CrossCuttingCommands } from '../../core/schemas/lifecycle';

export interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface McpToolCallRequest {
	tool: string;
	args: Record<string, unknown>;
	projectId: string;
	apiToken: string;
	user?: string;
}

export interface McpToolCallResult {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export class OrchestratorMcpAdapter {
	private context: ProjectContext;

	constructor(context: ProjectContext) {
		this.context = context;
	}

	getToolDefinitions(): McpToolDefinition[] {
		const stageCommands = AllowedCommandsByStage[this.context.lifecycleStage] || [];
		const allCommands = [...stageCommands, ...CrossCuttingCommands, ...(this.context.customCommands || [])];

		return allCommands.map(cmd => ({
			name: `orchestrator.${cmd}`,
			description: `Execute the '${cmd}' orchestrator command (stage: ${this.context.lifecycleStage})`,
			inputSchema: {
				type: 'object',
				properties: {
					input: { type: 'object', description: 'Command-specific input' },
					user: { type: 'string', description: 'Operator identity' },
				},
			},
		}));
	}

	async handleToolCall(request: McpToolCallRequest): Promise<McpToolCallResult> {
		// Validate project scope
		if (request.projectId !== this.context.projectId) {
			return {
				success: false,
				error: `Project ID mismatch: expected ${this.context.projectId}, got ${request.projectId}`,
			};
		}

		// Strip orchestrator. prefix if present
		const command = request.tool.startsWith('orchestrator.')
			? request.tool.slice('orchestrator.'.length)
			: request.tool;

		const { result, audit } = await WorkflowEngine.dispatch(
			this.context,
			command,
			request.args,
			request.user || 'mcp-client'
		);

		return {
			success: result.success,
			data: result.success
				? { artifact: result.artifact as Record<string, unknown>, audit: audit as unknown as Record<string, unknown> }
				: undefined,
			error: result.error,
		};
	}

	updateContext(updates: Partial<ProjectContext>): void {
		Object.assign(this.context, updates);
	}
}
