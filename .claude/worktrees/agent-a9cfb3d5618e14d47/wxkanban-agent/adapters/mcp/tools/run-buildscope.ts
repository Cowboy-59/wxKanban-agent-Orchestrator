// Tool to run buildscope via MCP adapter
import { OrchestratorMcpAdapter, McpToolCallRequest, McpToolCallResult } from '../server';

export async function runBuildscopeTool(
	adapter: OrchestratorMcpAdapter,
	projectId: string,
	apiToken: string,
	args: Record<string, unknown>,
	user?: string
): Promise<McpToolCallResult> {
	const request: McpToolCallRequest = {
		tool: 'orchestrator.buildscope',
		args,
		projectId,
		apiToken,
		user,
	};
	return adapter.handleToolCall(request);
}
