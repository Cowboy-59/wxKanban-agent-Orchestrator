// Project context resolution logic
import { LifecycleStage } from '../schemas/lifecycle';
import { Feature, ScopeDraft } from '../schemas/artifacts';

export interface ProjectContext {
	projectId: string;
	projectName: string;
	description: string;
	lifecycleStage: LifecycleStage;
	features: Feature[];
	artifacts: ScopeDraft[];
	customCommands?: string[];
}
