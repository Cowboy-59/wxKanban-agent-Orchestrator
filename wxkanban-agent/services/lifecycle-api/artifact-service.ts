// Artifact service — wraps MCP document and spec operations
import { LifecycleClient, LifecycleClientConfig } from './lifecycle-client';
import { ScopeDraft } from '../../core/schemas/artifacts';

export class ArtifactService {
	private client: LifecycleClient;

	constructor(config?: Partial<LifecycleClientConfig>) {
		this.client = new LifecycleClient(config);
	}

	async createScopeDocument(artifact: ScopeDraft): Promise<{ success: boolean; id?: string }> {
		return this.client.createArtifact(artifact);
	}

	async captureArtifactEvent(
		artifact: ScopeDraft,
		actor: string
	): Promise<{ success: boolean; id?: string }> {
		return this.client.captureEvent(
			'spec_created',
			'orchestrator-kit',
			actor,
			`Created scope: ${artifact.title}`,
			{ title: artifact.title, objectives: artifact.objectives }
		);
	}
}
