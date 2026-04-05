// Project context resolution logic
import { LifecycleStage } from '../schemas/lifecycle';

export interface ProjectContext {
	projectName: string;
	description: string;
	lifecycleStage: LifecycleStage;
	features: any[];
	artifacts: any[];
}
