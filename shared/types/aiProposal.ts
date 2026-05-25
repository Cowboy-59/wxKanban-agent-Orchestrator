/**
 * AIProposal Type Definition
 * Represents AI-generated task or feature proposals
 * 
 * @task T045
 */

export type AIProposalStatus = 
	| 'draft' 
	| 'pending-review' 
	| 'approved' 
	| 'rejected' 
	| 'implemented' 
	| 'dismissed';

export type AIProposalType = 
	| 'new-task' 
	| 'phase-transition' 
	| 'specification' 
	| 'improvement' 
	| 'bug-fix';

export interface AIProposal {
	proposalid: string; // UUID
	projectid: string; // UUID reference to project
	// Proposal details
	type: AIProposalType;
	title: string;
	rationale: string; // Markdown format explaining the proposal
	// AI confidence and metadata
	aiconfidence: number; // 0.0 to 1.0
	aimodel: string; // e.g., "gpt-4", "claude-3"
	aipromptversion: string; // Version of the prompt used
	// Related data
	suggestedtasks?: Array<{
		title: string;
		description: string;
		estimatedhours: number;
		priority: 'low' | 'medium' | 'high';
	}>;
	relatedspecid?: string; // If generated from a spec
	relatedfeedbackid?: string; // If generated from feedback
	// Status
	status: AIProposalStatus;
	// Review tracking
	reviewedby?: string; // User ID
	reviewedat?: string; // ISO 8601 timestamp
	reviewnotes?: string;
	// Implementation tracking
	implementedtaskids?: string[]; // Tasks created from this proposal
	// Audit fields
	createdat?: string;
	updatedat?: string;
	createdby: string; // User ID who triggered AI (required)
	updatedby?: string;
}

// Type for creating a new AI proposal
export type CreateAIProposalInput = Omit<
	AIProposal,
	'proposalid' | 'aiconfidence' | 'aimodel' | 'aipromptversion' | 
	'status' | 'reviewedby' | 'reviewedat' | 'reviewnotes' | 'implementedtaskids' |
	'createdat' | 'updatedat' | 'updatedby'
>;

// Type for updating an AI proposal (review/approval)
export type UpdateAIProposalInput = Partial<
	Omit<AIProposal, 'proposalid' | 'projectid' | 'type' | 'title' | 'rationale' | 
	'aimodel' | 'aipromptversion' | 'createdat' | 'createdby'>
>;

// Type for AI proposal with user details
export interface AIProposalWithUser extends AIProposal {
	createdbyuser?: {
		userid: string;
		name: string;
		avatar?: string;
	};
	reviewedbyuser?: {
		userid: string;
		name: string;
		avatar?: string;
	};
}

// Type for AI generation request
export interface AIGenerateRequest {
	projectid: string;
	type: AIProposalType;
	context: string; // Additional context for AI
	basedonspecid?: string;
	basedonfeedbackid?: string;
	preferredpriority?: 'low' | 'medium' | 'high';
}
