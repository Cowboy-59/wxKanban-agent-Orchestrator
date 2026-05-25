/**
 * TimeEntry Type Definition
 * Represents time tracking entries for tasks
 * 
 * @task T040
 */

export type TimeEntryStatus = 'running' | 'paused' | 'completed' | 'billed' | 'written-off';

export interface TimeEntry {
	timeentryid: string; // UUID
	taskid: string; // UUID reference to task
	userid: string; // UUID reference to user who logged time
	// Time tracking
	starttime: string; // ISO 8601 timestamp
	endtime?: string; // ISO 8601 timestamp (null if still running)
	duration: number; // Duration in minutes (calculated)
	// Billing
	isbillable: boolean;
	hourlyrate?: number; // In cents, for accurate calculations
	billedamount?: number; // Calculated: (duration / 60) * hourlyrate
	invoiceid?: string; // UUID reference to invoice if billed
	// Description
	description?: string; // What was done during this time
	// Status
	status: TimeEntryStatus;
	// Source tracking
	source: 'manual' | 'timer' | 'import' | 'ai-suggestion';
	// Audit fields
	createdat?: string;
	updatedat?: string;
	createdby: string; // User ID (required)
	updatedby?: string;
}

// Type for creating a new time entry
export type CreateTimeEntryInput = Omit<
	TimeEntry,
	'timeentryid' | 'duration' | 'billedamount' | 'invoiceid' | 'status' | 'createdat' | 'updatedat' | 'updatedby'
>;

// Type for updating a time entry
export type UpdateTimeEntryInput = Partial<
	Omit<TimeEntry, 'timeentryid' | 'taskid' | 'userid' | 'createdat' | 'createdby'>
>;

// Type for time entry with related data (for display)
export interface TimeEntryWithRelations extends TimeEntry {
	task?: {
		taskid: string;
		title: string;
		projectid: string;
	};
	project?: {
		projectid: string;
		name: string;
	};
	user?: {
		userid: string;
		name: string;
		avatar?: string;
	};
}

// Helper type for timer operations
export interface TimerState {
	timeentryid: string;
	taskid: string;
	starttime: string;
	elapsedminutes: number;
	isrunning: boolean;
}
