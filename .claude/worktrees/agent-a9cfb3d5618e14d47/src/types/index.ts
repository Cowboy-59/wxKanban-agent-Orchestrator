/**
 * TypeScript Utility Types for Company Management
 * Feature 002: Type-safe company-scoped queries and company isolation
 */

import { UserRole, ProjectRole } from '../lib/rbac-matrix.js';

// ============================================================================
// JWT Token Types
// ============================================================================

/**
 * JWT Token claims with company isolation
 */
export interface JWTClaims {
  userid: string;
  email: string;
  companyid?: string;
  role?: UserRole;
  iat: number;
  exp: number;
}

/**
 * Express Request with authenticated user
 */
export interface AuthRequest {
  user?: {
    userid: string;
    email: string;
    companyid?: string;
    role?: UserRole;
  };
}

// ============================================================================
// Company-Scoped Query Types
// ============================================================================

/**
 * Base type for any company-scoped entity
 * Ensures all queries include company isolation
 */
export interface CompanyScopedEntity {
  companyid: string;
}

/**
 * Query filter for company-scoped data
 * Automatically restricts queries to user's company
 */
export interface CompanyFilter {
  companyid: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Generic paginated list response
 */
export interface PaginatedList<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// Company Types
// ============================================================================

export type BillingPlan = 'Free' | 'Professional' | 'Enterprise';

export interface Company extends CompanyScopedEntity {
  companyid: string;
  name: string;
  contactemail: string;
  address: string | null;
  billingplan: string;
  hourlyrate: string | null;
  logourl: string | null;
  activeflag: boolean;
  verifiedat: Date | null;
  createdat: Date;
  updatedat: Date;
}

// ============================================================================
// User Types
// ============================================================================

export interface User extends CompanyScopedEntity {
  userid: string;
  email: string;
  companyid: string;
  role: UserRole;
  activeflag: boolean;
  payrate?: number;
  tracktimeflag: boolean;
  timezone: string;
  joinedat?: Date;
  lastloginedat?: Date;
  createdat: Date;
  updatedat: Date;
}

/**
 * User without sensitive fields (safe for API responses)
 * User type already excludes passwordhash, so this is equivalent to User
 */
export type UserPublic = User;

// ============================================================================
// Project Types
// ============================================================================

export type ProjectPhase = 'Design' | 'Development' | 'Testing' | 'Deployment' | 'Maintenance';

export interface Project extends CompanyScopedEntity {
  projectid: string;
  userid: string;
  companyid: string;
  name: string;
  description?: string;
  pmsystems?: string;
  hourlyrate?: number;
  allocatedhours?: number;
  currentphase: ProjectPhase;
  createdat: Date;
  updatedat: Date;
}

// ============================================================================
// ProjectUser (Team Assignment) Types
// ============================================================================

export interface ProjectUser {
  projectuserid: string;
  projectid: string;
  userid: string;
  role: ProjectRole;
  assignedat: Date;
  removedat?: Date;
}

/**
 * ProjectUser with User details (for team listings)
 */
export interface ProjectUserWithUser extends ProjectUser {
  user: UserPublic;
}

/**
 * ProjectUser with Project details (for user's projects)
 */
export interface ProjectUserWithProject extends ProjectUser {
  project: Project;
}

// ============================================================================
// Invoice Types
// ============================================================================

export interface Invoice extends CompanyScopedEntity {
  invoiceid: string;
  projectid?: string;
  companyid: string;
  clientemail?: string;
  invoicenumber: string;
  billedto?: string;
  generatedat: Date;
  totalamount: number;
  hoursworked: number;
  description?: string;
  downloadurl?: string;
  emailsent: boolean;
  sentat?: Date;
  createdat: Date;
}

/**
 * Invoice line item (for detailed invoicing)
 */
export interface InvoiceLineItem {
  userid: string;
  userEmail: string;
  projectid: string;
  projectName: string;
  hours: number;
  rate: number;
  amount: number;
  description?: string;
}

// ============================================================================
// UserInvitation Types
// ============================================================================

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface UserInvitation extends CompanyScopedEntity {
  invitationid: string;
  companyid: string;
  email: string;
  token: string;
  status: InvitationStatus;
  expiresat?: Date;
  invitedat: Date;
  acceptedat?: Date;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export interface CompanyAuditLog extends CompanyScopedEntity {
  auditid: string;
  companyid: string;
  action: string;
  changedby?: string;
  previousvalue?: Record<string, unknown>;
  newvalue?: Record<string, unknown>;
  description?: string;
  timestamp: Date;
}

/**
 * Audit log action types
 */
export enum AuditAction {
  COMPANY_CREATED = 'COMPANY_CREATED',
  COMPANY_UPDATED = 'COMPANY_UPDATED',
  COMPANY_DEACTIVATED = 'COMPANY_DEACTIVATED',
  USER_INVITED = 'USER_INVITED',
  USER_JOINED = 'USER_JOINED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  PROJECT_CREATED = 'PROJECT_CREATED',
  PROJECT_UPDATED = 'PROJECT_UPDATED',
  PROJECT_USER_ASSIGNED = 'PROJECT_USER_ASSIGNED',
  PROJECT_USER_REMOVED = 'PROJECT_USER_REMOVED',
  RATE_CHANGED = 'RATE_CHANGED',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  INVOICE_EMAILED = 'INVOICE_EMAILED',
}

// ============================================================================
// Query Result Types
// ============================================================================

/**
 * Generic query result wrapper
 */
export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * List query result
 */
export interface ListQueryResult<T> {
  success: boolean;
  data?: T[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API success response
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

/**
 * Paginated API response
 */
export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  timestamp: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract a subset of fields from a type
 */
export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

/**
 * Exclude a subset of fields from a type
 */
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Readonly version of a type
 */
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

/**
 * Union type of all keys in an object
 */
export type KeyOf<T> = keyof T;

/**
 * Nullable/optional field helper
 */
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
