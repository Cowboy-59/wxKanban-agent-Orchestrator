/**
 * Shared API types between frontend and backend
 */

// ========== Auth ==========
export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  userid: string;
  email: string;
  token: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignInResponse {
  userid: string;
  email: string;
  token: string;
}

export interface CurrentUserResponse {
  userid: string;
  email: string;
}

// ========== PM System ==========
export interface PMSystemConnectionResponse {
  connectionid: string;
  pmsystem: "jira" | "monday" | "asana" | "trello";
  syncstatus: "active" | "expired" | "failed";
  lastsyncsat?: string;
}

export interface ConnectPMSystemRequest {
  pmsystem: "jira" | "monday" | "asana" | "trello";
  code: string; // OAuth authorization code
}

// ========== Tasks ==========
export interface TaskResponse {
  taskid: string;
  projectid: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "completed" | "orphaned";
  duedate?: string;
  sourcepmssystem?: string;
  sourceoforigin: "external" | "internal" | "ai_proposed";
  createdat: string;
  updatedat: string;
}

export interface TaskFilterQuery {
  projectid?: string;
  priority?: string;
  status?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTaskRequest {
  projectid: string;
  title: string;
  description?: string;
  priority?: string;
  duedate?: string;
}

// ========== Time Tracking ==========
export interface TimeEntryResponse {
  entryid: string;
  taskid: string;
  projectid: string;
  starttime: string;
  endtime: string;
  duration: number; // minutes
  billable: boolean;
  notes?: string;
  invoiced: boolean;
  createdat: string;
}

export interface StartTimerRequest {
  taskid: string;
  projectid: string;
}

export interface StopTimerRequest {
  billable: boolean;
  notes?: string;
}

export interface StopTimerResponse {
  entryid: string;
  duration: number;
  billable: boolean;
  createdat: string;
}

// ========== Projects ==========
export interface ProjectResponse {
  projectid: string;
  userid: string;
  name: string;
  description?: string;
  currentphase: string;
  hourlyrate?: number;
  createdat: string;
  updatedat: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  hourlyrate?: number;
}

// ========== Invoices ==========
export interface InvoiceResponse {
  invoiceid: string;
  projectid: string;
  totalamount: number;
  hoursworked: number;
  generatedat: string;
  downloadurl?: string;
  emailsent: boolean;
}

export interface GenerateInvoiceRequest {
  projectid: string;
  startdate: string; // ISO date
  enddate: string; // ISO date
}

// ========== Error Response ==========
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, any>;
}

// ========== Pagination ==========
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
