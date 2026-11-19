/**
 * Specification Type Definition
 * Represents a project specification document
 * 
 * @task T039b
 */

export type SpecificationStatus = 'draft' | 'in-review' | 'approved' | 'rejected' | 'archived';

export interface Specification {
	specid: string; // UUID
	projectid: string; // UUID reference to project
	phaseid?: string; // UUID reference to phase (optional)
	specnumber: string; // e.g., "SPEC-001", "SPEC-002"
	title: string;
	content: string; // Markdown format for rich text
	status: SpecificationStatus;
	// Version control
	version: number; // Incremental version number
	previousversionid?: string; // Reference to previous version
	// Review tracking
	reviewedby?: string; // User ID of reviewer
	reviewedat?: string; // ISO 8601 timestamp
	// Audit fields
	createdat?: string;
	updatedat?: string;
	createdby?: string;
	updatedby?: string;
}

// Type for creating a new specification
export type CreateSpecificationInput = Omit<
	Specification,
	'specid' | 'version' | 'previousversionid' | 'reviewedby' | 'reviewedat' | 'createdat' | 'updatedat' | 'createdby' | 'updatedby'
>;

// Type for updating a specification
export type UpdateSpecificationInput = Partial<
	Omit<Specification, 'specid' | 'projectid' | 'specnumber' | 'createdat' | 'createdby'>
>;

// Type for specification with parsed content (for frontend display)
export interface SpecificationWithParsedContent extends Specification {
	parsedcontent?: {
		sections: Array<{
			heading: string;
			content: string;
		}>;
		metadata: Record<string, string>;
	};
}
