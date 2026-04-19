// Artifact schemas
import { LifecycleStage } from './lifecycle';

export interface Feature {
	id: string;
	name: string;
	stage: LifecycleStage;
}

export interface ScopeDraft {
	title: string;
	problemStatement: string;
	objectives: string[];
	constraints?: string[];
	acceptanceCriteria?: string[];
	notes?: string;
}

export interface AuditRecord {
	timestamp: string;
	command: string;
	input: Record<string, unknown>;
	result: Record<string, unknown>;
	user?: string;
}

export interface HandoffBundle {
	features: Feature[];
	artifacts: ScopeDraft[];
	auditTrail: AuditRecord[];
}
