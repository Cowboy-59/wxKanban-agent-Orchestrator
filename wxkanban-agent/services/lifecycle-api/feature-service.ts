// Feature service — wraps MCP task and item operations
import { LifecycleClient, LifecycleClientConfig } from './lifecycle-client';

export interface CreateTaskInput {
	title: string;
	description: string;
	status?: 'todo' | 'in_progress' | 'blocked' | 'done';
	priority?: 'low' | 'medium' | 'high' | 'critical';
	assignee?: string;
}

export class FeatureService {
	private client: LifecycleClient;

	constructor(config?: Partial<LifecycleClientConfig>) {
		this.client = new LifecycleClient(config);
	}

	async createTask(input: CreateTaskInput): Promise<{ success: boolean; data?: Record<string, unknown> }> {
		return this.client['callMcpTool']('project.create_task', {
			projectId: this.client['config'].projectId,
			title: input.title,
			descriptionMarkdown: input.description,
			...(input.status ? { status: input.status } : {}),
			...(input.priority ? { priority: input.priority } : {}),
			...(input.assignee ? { assignee: input.assignee } : {}),
		});
	}

	async updateTaskStatus(
		taskId: string,
		status: 'todo' | 'in_progress' | 'blocked' | 'done'
	): Promise<{ success: boolean; data?: Record<string, unknown> }> {
		return this.client['callMcpTool']('project.update_task_status', {
			taskId,
			status,
		});
	}

	async linkDocToTask(taskId: string, documentId: string): Promise<{ success: boolean; data?: Record<string, unknown> }> {
		return this.client['callMcpTool']('project.link_doc_to_task', {
			taskId,
			documentId,
		});
	}

	async listOpenItems(maxItems?: number): Promise<{ success: boolean; data?: Record<string, unknown> }> {
		return this.client.listOpenItems(maxItems);
	}
}
