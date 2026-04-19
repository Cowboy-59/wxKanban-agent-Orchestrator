import { AuthContext, UserRole, createAuthError } from './auth-context.js';

// Permission matrix: which roles can access which tools
const PERMISSION_MATRIX: Record<string, UserRole[]> = {
  // Read-only tools
  'project.help': ['read_only', 'editor', 'admin'],
  'project.mcp_health': ['read_only', 'editor', 'admin'],
  'project.capture_event': ['read_only', 'editor', 'admin'],
  'project.list_open_items': ['read_only', 'editor', 'admin'],
  'project.timeline': ['read_only', 'editor', 'admin'],
  'project.summary': ['read_only', 'editor', 'admin'],
  'project.specs': ['read_only', 'editor', 'admin'],
  'project.kit_status': ['read_only', 'editor', 'admin'],
  'project.download_kit': ['read_only', 'editor', 'admin'],
  'project.list_api_tokens': ['read_only', 'editor', 'admin'],
  'project.check_for_updates': ['read_only', 'editor', 'admin'],
  
  // Editor tools
  'project.upsert_document': ['editor', 'admin'],
  'project.create_task': ['editor', 'admin'],
  'project.update_task_status': ['editor', 'admin'],
  'project.link_doc_to_task': ['editor', 'admin'],
  'project.create_specs': ['editor', 'admin'],
  'project.regenerate_kit': ['editor', 'admin'],
  'project.import_project': ['editor', 'admin'],
  'project.create_api_token': ['editor', 'admin'],
  'project.revoke_api_token': ['editor', 'admin'],
  'project.implement': ['editor', 'admin'],
  'project.analyze': ['editor', 'admin'],
  'project.session_start': ['editor', 'admin'],
  
  // Scope tools
  'project.buildscope': ['editor', 'admin'],
  'project.validatescope': ['read_only', 'editor', 'admin'],
  
  // Proposal tools (Spec 024)
  'project.submit_proposal': ['editor', 'admin'],

  // Update tools
  'project.upgrade_mcp': ['admin'],
  
  // Admin-only tools (future)
  'project.delete_task': ['admin'],
  'project.delete_document': ['admin'],
  'project.manage_users': ['admin'],
};

export function checkPermission(toolName: string, auth: AuthContext): void {
  const allowedRoles = PERMISSION_MATRIX[toolName];
  
  if (!allowedRoles) {
    throw createAuthError(`Unknown tool: ${toolName}`, 'FORBIDDEN');
  }
  
  if (!allowedRoles.includes(auth.role)) {
    throw createAuthError(
      `Role '${auth.role}' is not authorized to use '${toolName}'. ` +
      `Allowed roles: ${allowedRoles.join(', ')}`,
      'FORBIDDEN'
    );
  }
}

export function canRead(auth: AuthContext): boolean {
  return ['read_only', 'editor', 'admin'].includes(auth.role);
}

export function canWrite(auth: AuthContext): boolean {
  return ['editor', 'admin'].includes(auth.role);
}

export function canAdmin(auth: AuthContext): boolean {
  return auth.role === 'admin';
}
