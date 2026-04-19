// Lifecycle API client — communicates with MCP server via HTTP
import { ScopeDraft } from '../../core/schemas/artifacts';
import { LifecycleStage } from '../../core/schemas/lifecycle';

interface McpCallResult {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export interface LifecycleClientConfig {
	mcpBaseUrl: string;
	apiKey: string;
	projectId: string;
}

const DEFAULT_CONFIG: LifecycleClientConfig = {
	mcpBaseUrl: process.env['MCP_BASE_URL'] || 'http://localhost:3002',
	apiKey: process.env['WXKANBAN_API_TOKEN'] || '',
	projectId: process.env['WXKANBAN_PROJECT_ID'] || '',
};

export class LifecycleClient {
	private config: LifecycleClientConfig;

	constructor(config?: Partial<LifecycleClientConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	private async callMcpTool(tool: string, args: Record<string, unknown>): Promise<McpCallResult> {
		const url = `${this.config.mcpBaseUrl}/call`;
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'API_KEY': this.config.apiKey,
				},
				body: JSON.stringify({ tool, args }),
			});
			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `MCP call failed (${response.status}): ${text}` };
			}
			const data = await response.json() as Record<string, unknown>;
			return { success: true, data };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			return { success: false, error: `MCP connection failed: ${message}` };
		}
	}

	async checkHealth(): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
		try {
			const response = await fetch(`${this.config.mcpBaseUrl}/health`);
			if (!response.ok) {
				return { healthy: false };
			}
			const data = await response.json() as Record<string, unknown>;
			return { healthy: data['status'] === 'ok', details: data };
		} catch {
			return { healthy: false };
		}
	}

	async createArtifact(artifact: ScopeDraft): Promise<{ success: boolean; id?: string }> {
		const result = await this.callMcpTool('project.upsert_document', {
			projectId: this.config.projectId,
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
			projectId: this.config.projectId,
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
			projectId: this.config.projectId,
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
			projectId: this.config.projectId,
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
