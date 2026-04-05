// Artifact schemas
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
	input: any;
	result: any;
	user?: string;
}

export interface HandoffBundle {
	features: any[];
	artifacts: any[];
	auditTrail: AuditRecord[];
}
