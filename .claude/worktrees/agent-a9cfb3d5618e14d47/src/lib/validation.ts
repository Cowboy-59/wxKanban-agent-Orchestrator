/**
 * Validation Schemas for Admin & Company Management
 * Feature 002: Company Registration, User Management, Billing
 *
 * All schemas use Zod for runtime validation with TypeScript inference
 */

import { z } from 'zod';

// ============================================================================
// Company Validation Schemas
// ============================================================================

export const companyNameSchema = z
  .string()
  .min(2, 'Company name must be at least 2 characters')
  .max(255, 'Company name must be at most 255 characters')
  .trim();

export const companyEmailSchema = z
  .string()
  .email('Invalid company email format')
  .max(255, 'Email must be at most 255 characters')
  .toLowerCase();

export const billingPlanSchema = z.enum(['Free', 'Professional', 'Enterprise'], {
  errorMap: () => ({ message: 'Billing plan must be Free, Professional, or Enterprise' }),
});

export const hourlyRateSchema = z
  .number()
  .positive('Hourly rate must be greater than 0')
  .max(10000, 'Hourly rate cannot exceed $10,000/hour')
  .optional();

export const companyCreateSchema = z.object({
  name: companyNameSchema,
  contactemail: companyEmailSchema,
  billingplan: billingPlanSchema.default('Free'),
  hourlyrate: hourlyRateSchema,
  address: z.string().max(500, 'Address must be at most 500 characters').optional(),
  logourl: z.string().url('Invalid logo URL').max(255, 'Logo URL too long').optional(),
});

export const companyUpdateSchema = z.object({
  name: companyNameSchema.optional(),
  contactemail: companyEmailSchema.optional(),
  billingplan: billingPlanSchema.optional(),
  hourlyrate: hourlyRateSchema,
  address: z.string().max(500).optional(),
  logourl: z.string().url().max(255).optional(),
});

export type CompanyCreate = z.infer<typeof companyCreateSchema>;
export type CompanyUpdate = z.infer<typeof companyUpdateSchema>;

// ============================================================================
// User Validation Schemas
// ============================================================================

export const userEmailSchema = z
  .string()
  .email('Invalid email format')
  .max(255)
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const userRoleSchema = z.enum(['Admin', 'TeamManager', 'Developer'], {
  errorMap: () => ({ message: 'Role must be Admin, TeamManager, or Developer' }),
});

export const userInviteSchema = z.object({
  email: userEmailSchema,
  role: userRoleSchema.default('Developer'),
  payrate: hourlyRateSchema,
});

export const userUpdateSchema = z.object({
  role: userRoleSchema.optional(),
  payrate: hourlyRateSchema,
  activeflag: z.boolean().optional(),
  tracktimeflag: z.boolean().optional(),
  timezone: z.string().max(50).optional(),
});

export const bulkUserInviteSchema = z.object({
  users: z.array(userInviteSchema).min(1, 'At least one user required').max(100, 'Maximum 100 users at a time'),
});

export type UserInvite = z.infer<typeof userInviteSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
export type BulkUserInvite = z.infer<typeof bulkUserInviteSchema>;

// ============================================================================
// Project Validation Schemas
// ============================================================================

export const projectNameSchema = z
  .string()
  .min(2, 'Project name must be at least 2 characters')
  .max(255, 'Project name must be at most 255 characters')
  .trim();

export const projectPhaseSchema = z.enum(['Design', 'Development', 'Testing', 'Deployment', 'Maintenance'], {
  errorMap: () => ({ message: 'Phase must be Design, Development, Testing, Deployment, or Maintenance' }),
});

export const projectUpdateSchema = z.object({
  name: projectNameSchema.optional(),
  description: z.string().max(2000).optional(),
  hourlyrate: hourlyRateSchema,
  currentphase: projectPhaseSchema.optional(),
});

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

// ============================================================================
// ProjectUser Validation Schemas
// ============================================================================

export const projectUserRoleSchema = z.enum(['Lead', 'TeamMember', 'Observer'], {
  errorMap: () => ({ message: 'Project role must be Lead, TeamMember, or Observer' }),
});

export const projectUserAssignSchema = z.object({
  userid: z.string().uuid('Invalid user ID'),
  role: projectUserRoleSchema.default('TeamMember'),
});

export type ProjectUserAssign = z.infer<typeof projectUserAssignSchema>;

// ============================================================================
// Billing Validation Schemas
// ============================================================================

export const invoiceNumberSchema = z
  .string()
  .regex(/^INV-\d{4}-\d+$/, 'Invoice number must match format INV-YYYY-NNN')
  .max(50);

export const invoiceCreateSchema = z.object({
  projectid: z.string().uuid('Invalid project ID'),
  billedto: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
});

export const rateUpdateSchema = z.object({
  hourlyrate: hourlyRateSchema,
  level: z.enum(['company', 'project', 'user']),
});

export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
export type RateUpdate = z.infer<typeof rateUpdateSchema>;

// ============================================================================
// Batch Validation Helpers
// ============================================================================

/**
 * Validate email list for bulk operations
 */
export function validateEmailList(emails: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const email of emails) {
    try {
      userEmailSchema.parse(email);
      valid.push(email);
    } catch {
      invalid.push(email);
    }
  }

  return { valid, invalid };
}

/**
 * Validate rate hierarchy (user > project > company)
 */
export function validateRateHierarchy(
  userRate?: number,
  projectRate?: number,
  companyRate?: number
): boolean {
  // At least company rate must be set
  if (!companyRate) {
    return false;
  }

  // All must be positive if set
  if (userRate && userRate <= 0) return false;
  if (projectRate && projectRate <= 0) return false;
  if (companyRate && companyRate <= 0) return false;

  // All must be within maximum
  const MAX_RATE = 10000;
  if (userRate && userRate > MAX_RATE) return false;
  if (projectRate && projectRate > MAX_RATE) return false;
  if (companyRate && companyRate > MAX_RATE) return false;

  return true;
}

/**
 * Validate date range for invoice generation
 */
export function validateDateRange(startDate: Date, endDate: Date): boolean {
  // Start must be before end
  if (startDate >= endDate) {
    return false;
  }

  // Range cannot exceed 12 months
  const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  if (monthsDiff > 12) {
    return false;
  }

  // Cannot be in the future
  if (endDate > new Date()) {
    return false;
  }

  return true;
}
