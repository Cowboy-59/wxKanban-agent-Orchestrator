/**
 * FeedbackEntry Type Definition
 * Represents feedback captured during project phases
 * 
 * @task T039c
 */

export type FeedbackCategory = 
	| 'bug' 
	| 'feature-request' 
	| 'improvement' 
	| 'question' 
	| 'complaint' 
	| 'praise';

export type FeedbackResolutionStatus = 
	| 'open' 
	| 'acknowledged' 
	| 'in-progress' 
	| 'resolved' 
	| 'closed' 
	| 'converted-to-spec';

export interface FeedbackEntry {
	feedbackid: string; // UUID
	projectid: string; // UUID reference to project
	phaseid?: string; // UUID reference to phase (optional)
	category: FeedbackCategory;
	content: string; // Markdown format
	// Resolution tracking
	resolutionstatus: FeedbackResolutionStatus;
	resolutionnotes?: string;
	resolvedby?: string; // User ID
	resolvedat?: string; // ISO 8601 timestamp
	// Conversion to specification
	convertedspecid?: string; // If converted to spec
	// Source tracking
	source: 'manual' | 'import' | 'ai-suggestion';
	originalsourceid?: string; // Reference to external source if imported
	// Priority
	priority: 'low' | 'medium' | 'high' | 'critical';
	// Audit fields
	createdat?: string;
	updatedat?: string;
	createdby: string; // User ID (required)
	updatedby?: string;
}

// Type for creating new feedback
export type CreateFeedbackInput = Omit<
	FeedbackEntry,
	'feedbackid' | 'resolutionstatus' | 'resolutionnotes' | 'resolvedby' | 'resolvedat' | 
	'convertedspecid' | 'createdat' | 'updatedat' | 'updatedby'
>;

// Type for updating feedback
export type UpdateFeedbackInput = Partial<
	Omit<FeedbackEntry, 'feedbackid' | 'projectid' | 'createdat' | 'createdby'>
>;

// Type for feedback with user details (for display)
export interface FeedbackWithUser extends FeedbackEntry {
	createdbyuser?: {
		userid: string;
		name: string;
		avatar?: string;
	};
}
