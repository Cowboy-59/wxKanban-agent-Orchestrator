// Project context resolution logic
import { LifecycleStage } from '../schemas/lifecycle';
import { Feature, ScopeDraft } from '../schemas/artifacts';
import type { ScopeStageFacts } from '../policy/policy';

export interface ProjectContext {
	projectId: string;
	projectName: string;
	description: string;
	// Display only. SCOPE-123: no gate reads a project stage; the gates read `scope`.
	lifecycleStage: LifecycleStage;
	// SCOPE-123 FR-001 — the scope the command names, resolved from the hub
	// before dispatch. Undefined when the command names none.
	scope?: ScopeStageFacts;
	features: Feature[];
	artifacts: ScopeDraft[];
	customCommands?: string[];
}
