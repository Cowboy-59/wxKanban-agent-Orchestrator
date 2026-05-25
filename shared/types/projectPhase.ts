/**
 * ProjectPhase Type Definition
 * Represents a phase in the project lifecycle
 * 
 * @task T039a
 */

export type PhaseStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface ProjectPhase {
	phaseid: string; // UUID
	projectid: string; // UUID reference to project
	phasenumber: number; // Sequential phase number (1, 2, 3...)
	phasename: string; // e.g., "Discovery", "Design", "Development"
	status: PhaseStatus;
	entryat: string; // ISO 8601 timestamp
	completedat?: string; // ISO 8601 timestamp, optional until completed
	// Audit fields
	createdat?: string;
	updatedat?: string;
	createdby?: string;
	updatedby?: string;
}

// Type for creating a new phase (omit system fields)
export type CreateProjectPhaseInput = Omit<
	ProjectPhase,
	'phaseid' | 'createdat' | 'updatedat' | 'createdby' | 'updatedby'
>;

// Type for updating a phase (partial, omit immutable fields)
export type UpdateProjectPhaseInput = Partial<
	Omit<ProjectPhase, 'phaseid' | 'projectid' | 'createdat' | 'createdby'>
>;
