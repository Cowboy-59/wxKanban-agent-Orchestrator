// Workflow engine
import { CommandPolicyEngine } from '../policy/command-policy';
import { LifecycleClient } from '../../services/lifecycle-api/lifecycle-client';
import { BuildScopeWorker } from '../../workers/ai/buildscope-worker';
import { ProjectContext } from '../context/project-context';
import { LifecycleStage } from '../schemas/lifecycle';

export class WorkflowEngine {
	static async runBuildScope(context: ProjectContext, input: any) {
		if (!CommandPolicyEngine.evaluate(context.lifecycleStage, 'buildscope')) {
			throw new Error('buildscope not allowed in current stage');
		}
		const draft = await BuildScopeWorker.generateScopeDraft(input);
		const artifactResult = await LifecycleClient.createArtifact(draft);
		if (!artifactResult.success) throw new Error('Artifact creation failed');
		// Optionally transition stage
		await LifecycleClient.transitionFeature(artifactResult.id!, LifecycleStage.Implementation);
		return draft;
	}
}
