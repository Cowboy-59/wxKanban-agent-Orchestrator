// Lifecycle API client — communicates with MCP server via the shared mcp-client.
// Spec 028 / T022 — refactored to use core/http/mcp-client (Bearer + 429-retry + token resolution).
import { ScopeDraft } from '../../core/schemas/artifacts';
import { LifecycleStage } from '../../core/schemas/lifecycle';
import { McpClient } from '../../core/http/mcp-client';

interface McpCallResult {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export interface LifecycleClientConfig {
	projectId: string;
	mcpClient?: McpClient;
}

function buildDefaultConfig(): LifecycleClientConfig {
	return {
		projectId: process.env['WXKANBAN_PROJECT_ID'] || '',
	};
}

export class LifecycleClient {
	private projectId: string;
	private mcp: McpClient;

	constructor(config?: Partial<LifecycleClientConfig>) {
		const merged = { ...buildDefaultConfig(), ...config };
		this.projectId = merged.projectId;
		this.mcp = merged.mcpClient ?? new McpClient();
	}

	private async callMcpTool(tool: string, args: Record<string, unknown>): Promise<McpCallResult> {
		const result = await this.mcp.callTool<Record<string, unknown>>(tool, args);
		if (!result.ok) {
			return { success: false, error: result.error ?? `MCP call failed (${result.status})` };
		}
		return { success: true, data: result.data ?? {} };
	}

	async checkHealth(): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
		const result = await this.mcp.health();
		if (!result.ok) return { healthy: false };
		const details = result.data as Record<string, unknown> | undefined;
		return { healthy: details?.['status'] === 'ok', details };
	}

	async createArtifact(artifact: ScopeDraft): Promise<{ success: boolean; id?: string }> {
		const result = await this.callMcpTool('project.upsert_document', {
			projectId: this.projectId,
			title: artifact.title,
			bodyMarkdown: [
				`# ${artifact.title}`,
				'',
				'## Problem Statement',
				artifact.problemStatement,
				'',
				'## Objectives',
				...artifact.objectives.map(o => `- ${o}`),
				...(artifact.constraints?.length ? ['', '## Constraints', ...artifact.constraints.map(c => `- ${c}`)] : []),
				...(artifact.acceptanceCriteria?.length ? ['', '## Acceptance Criteria', ...artifact.acceptanceCriteria.map(a => `- ${a}`)] : []),
				...(artifact.notes ? ['', '## Notes', artifact.notes] : []),
			].join('\n'),
		});
		if (!result.success) {
			return { success: false };
		}
		const doc = result.data?.['document'] as Record<string, unknown> | undefined;
		return { success: true, id: doc?.['id'] as string | undefined };
	}

	async transitionFeature(featureId: string, stage: LifecycleStage): Promise<{ success: boolean }> {
		const result = await this.callMcpTool('project.capture_event', {
			projectId: this.projectId,
			type: 'document_updated',
			source: 'orchestrator-kit',
			actor: 'workflow-engine',
			rawContent: `Feature ${featureId} transitioned to ${stage}`,
			metadata: { featureId, newStage: stage },
		});
		return { success: result.success };
	}

	async captureEvent(
		type: string,
		source: string,
		actor: string,
		rawContent: string,
		metadata?: Record<string, unknown>
	): Promise<{ success: boolean; id?: string }> {
		const result = await this.callMcpTool('project.capture_event', {
			projectId: this.projectId,
			type,
			source,
			actor,
			rawContent,
			...(metadata ? { metadata } : {}),
		});
		if (!result.success) {
			return { success: false };
		}
		const event = result.data?.['event'] as Record<string, unknown> | undefined;
		return { success: true, id: event?.['id'] as string | undefined };
	}

	async listOpenItems(maxItems?: number): Promise<{ success: boolean; data?: Record<string, unknown> }> {
		const result = await this.callMcpTool('project.list_open_items', {
			projectId: this.projectId,
			...(maxItems ? { maxItems } : {}),
		});
		return result;
	}

	// Static convenience methods for backward compatibility (use default config)
	private static defaultInstance: LifecycleClient | undefined;
	private static getDefault(): LifecycleClient {
		if (!LifecycleClient.defaultInstance) {
			LifecycleClient.defaultInstance = new LifecycleClient();
		}
		return LifecycleClient.defaultInstance;
	}

	static async createArtifactStatic(artifact: ScopeDraft): Promise<{ success: boolean; id?: string }> {
		return LifecycleClient.getDefault().createArtifact(artifact);
	}

	static async transitionFeatureStatic(featureId: string, stage: LifecycleStage): Promise<{ success: boolean }> {
		return LifecycleClient.getDefault().transitionFeature(featureId, stage);
	}
}
