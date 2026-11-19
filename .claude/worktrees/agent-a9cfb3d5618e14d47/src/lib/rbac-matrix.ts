/**
 * Role-Based Access Control (RBAC) Matrix
 * Defines permissions for each role in the system
 *
 * Feature 002: Multi-user team management with role-based access control
 * Roles: Admin (full access), TeamManager (team & project management), Developer (read-only for most)
 */

export type UserRole = 'Admin' | 'TeamManager' | 'Developer';
export type ProjectRole = 'Lead' | 'TeamMember' | 'Observer';

/**
 * Permission definitions
 */
export const PERMISSION = {
  // Company permissions
  COMPANY_READ: 'company:read',
  COMPANY_CREATE: 'company:create',
  COMPANY_UPDATE: 'company:update',
  COMPANY_DELETE: 'company:delete',

  // User management
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  // Project management
  PROJECT_READ: 'project:read',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',

  // User-project assignment
  PROJECT_USER_READ: 'projectuser:read',
  PROJECT_USER_CREATE: 'projectuser:create',
  PROJECT_USER_UPDATE: 'projectuser:update',
  PROJECT_USER_DELETE: 'projectuser:delete',

  // Billing & invoicing
  BILLING_READ: 'billing:read',
  BILLING_UPDATE: 'billing:update',
  INVOICE_CREATE: 'invoice:create',
  INVOICE_READ: 'invoice:read',
  INVOICE_DELETE: 'invoice:delete',

  // Reporting & analytics
  REPORT_READ: 'report:read',
  AUDIT_READ: 'audit:read',

  // Admin dashboard
  DASHBOARD_READ: 'dashboard:read',
} as const;

export type Permission = typeof PERMISSION[keyof typeof PERMISSION];

/**
 * RBAC Matrix: Define what each role can do
 */
const rbacMatrix: Record<UserRole, Permission[]> = {
  Admin: [
    // Company
    PERMISSION.COMPANY_READ,
    PERMISSION.COMPANY_CREATE,
    PERMISSION.COMPANY_UPDATE,
    PERMISSION.COMPANY_DELETE,

    // Users - full access
    PERMISSION.USER_READ,
    PERMISSION.USER_CREATE,
    PERMISSION.USER_UPDATE,
    PERMISSION.USER_DELETE,

    // Projects - full access
    PERMISSION.PROJECT_READ,
    PERMISSION.PROJECT_CREATE,
    PERMISSION.PROJECT_UPDATE,
    PERMISSION.PROJECT_DELETE,

    // Project assignments - full access
    PERMISSION.PROJECT_USER_READ,
    PERMISSION.PROJECT_USER_CREATE,
    PERMISSION.PROJECT_USER_UPDATE,
    PERMISSION.PROJECT_USER_DELETE,

    // Billing - full access
    PERMISSION.BILLING_READ,
    PERMISSION.BILLING_UPDATE,
    PERMISSION.INVOICE_CREATE,
    PERMISSION.INVOICE_READ,
    PERMISSION.INVOICE_DELETE,

    // Reports - full access
    PERMISSION.REPORT_READ,
    PERMISSION.AUDIT_READ,
    PERMISSION.DASHBOARD_READ,
  ],

  TeamManager: [
    // Company
    PERMISSION.COMPANY_READ,

    // Users - can read and manage
    PERMISSION.USER_READ,
    PERMISSION.USER_CREATE,
    PERMISSION.USER_UPDATE,
    // Cannot delete users (only Admin)
    // Cannot modify billing or deactivate

    // Projects - full management
    PERMISSION.PROJECT_READ,
    PERMISSION.PROJECT_CREATE,
    PERMISSION.PROJECT_UPDATE,
    // Cannot delete projects

    // Project assignments - full access
    PERMISSION.PROJECT_USER_READ,
    PERMISSION.PROJECT_USER_CREATE,
    PERMISSION.PROJECT_USER_UPDATE,
    PERMISSION.PROJECT_USER_DELETE,

    // Billing - read-only (cannot configure rates or create invoices)
    PERMISSION.BILLING_READ,
    PERMISSION.INVOICE_READ,

    // Reports - can view
    PERMISSION.REPORT_READ,
    PERMISSION.DASHBOARD_READ,
  ],

  Developer: [
    // Company
    PERMISSION.COMPANY_READ,

    // Users - read-only
    PERMISSION.USER_READ,

    // Projects - read-only
    PERMISSION.PROJECT_READ,

    // Project assignments - read-only
    PERMISSION.PROJECT_USER_READ,

    // Billing - read-only
    PERMISSION.BILLING_READ,
    PERMISSION.INVOICE_READ,

    // Reports - can view (for tracking own time)
    PERMISSION.REPORT_READ,
    PERMISSION.DASHBOARD_READ,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rbacMatrix[role].includes(permission);
}

/**
 * Check if a role can perform an action on a resource
 */
export function canPerformAction(
  role: UserRole,
  action: 'read' | 'create' | 'update' | 'delete',
  resource: 'company' | 'user' | 'project' | 'projectuser' | 'billing' | 'invoice' | 'report' | 'audit' | 'dashboard'
): boolean {
  const permissionMap: Record<string, Permission> = {
    'company:read': PERMISSION.COMPANY_READ,
    'company:create': PERMISSION.COMPANY_CREATE,
    'company:update': PERMISSION.COMPANY_UPDATE,
    'company:delete': PERMISSION.COMPANY_DELETE,
    'user:read': PERMISSION.USER_READ,
    'user:create': PERMISSION.USER_CREATE,
    'user:update': PERMISSION.USER_UPDATE,
    'user:delete': PERMISSION.USER_DELETE,
    'project:read': PERMISSION.PROJECT_READ,
    'project:create': PERMISSION.PROJECT_CREATE,
    'project:update': PERMISSION.PROJECT_UPDATE,
    'project:delete': PERMISSION.PROJECT_DELETE,
    'projectuser:read': PERMISSION.PROJECT_USER_READ,
    'projectuser:create': PERMISSION.PROJECT_USER_CREATE,
    'projectuser:update': PERMISSION.PROJECT_USER_UPDATE,
    'projectuser:delete': PERMISSION.PROJECT_USER_DELETE,
    'billing:read': PERMISSION.BILLING_READ,
    'billing:update': PERMISSION.BILLING_UPDATE,
    'invoice:create': PERMISSION.INVOICE_CREATE,
    'invoice:read': PERMISSION.INVOICE_READ,
    'invoice:delete': PERMISSION.INVOICE_DELETE,
    'report:read': PERMISSION.REPORT_READ,
    'audit:read': PERMISSION.AUDIT_READ,
    'dashboard:read': PERMISSION.DASHBOARD_READ,
  };

  const permission = permissionMap[`${resource}:${action}`];
  return permission ? hasPermission(role, permission) : false;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return [...rbacMatrix[role]];
}

/**
 * Compare role hierarchy (Admin > TeamManager > Developer)
 * Returns: 1 if roleA > roleB, -1 if roleA < roleB, 0 if equal
 */
export function compareRoles(roleA: UserRole, roleB: UserRole): number {
  const hierarchy: Record<UserRole, number> = {
    Admin: 3,
    TeamManager: 2,
    Developer: 1,
  };

  const valueA = hierarchy[roleA];
  const valueB = hierarchy[roleB];

  if (valueA > valueB) return 1;
  if (valueA < valueB) return -1;
  return 0;
}

/**
 * Check if roleA has higher privileges than roleB
 */
export function isHigherRole(roleA: UserRole, roleB: UserRole): boolean {
  return compareRoles(roleA, roleB) > 0;
}

/**
 * Check if user can manage another user (hierarchy check)
 * You can only manage users of equal or lower role
 */
export function canManageUser(managerRole: UserRole, targetRole: UserRole): boolean {
  return compareRoles(managerRole, targetRole) >= 0;
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    Admin: 'Administrator',
    TeamManager: 'Team Manager',
    Developer: 'Developer',
  };
  return names[role];
}

/**
 * Get role description
 */
export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    Admin: 'Full access to all company features and user management',
    TeamManager: 'Manage team members and projects, view reports',
    Developer: 'Access to assigned projects and time tracking',
  };
  return descriptions[role];
}

/**
 * Validate role transition (can admin promote/demote to new role)
 */
export function isValidRoleTransition(
  currentRole: UserRole,
  newRole: UserRole,
  managerRole: UserRole
): { valid: boolean; reason?: string } {
  // Manager must be able to manage the current role holder
  if (!canManageUser(managerRole, currentRole)) {
    return {
      valid: false,
      reason: 'You cannot change the role of someone with equal or higher privileges',
    };
  }

  // Manager must be able to manage the new role
  if (!canManageUser(managerRole, newRole)) {
    return {
      valid: false,
      reason: 'You cannot assign a role equal to or higher than your own',
    };
  }

  return { valid: true };
}
