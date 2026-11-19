import { AuthContext, UserRole, createAuthError } from './auth-context.js';

// Permission matrix: which roles can access which tools
const PERMISSION_MATRIX: Record<string, UserRole[]> = {
  // Read-only tools
  'project.help': ['read_only', 'editor', 'admin'],
  'project.mcp_health': ['read_only', 'editor', 'admin'],
  'project.capture_event': ['read_only', 'editor', 'admin'],
  'project.list_open_items': ['read_only', 'editor', 'admin'],
  'project.cockpit_summary': ['read_only', 'editor', 'admin'], // [SCOPE 042 / T002] Dev Cockpit read
  'project.checkout_scope': ['editor', 'admin'], // [SCOPE 058 / T003] claim a scope
  'project.checkin_scope': ['editor', 'admin'], // [SCOPE 058 / T004] release (ADMIN-only force enforced in handler)
  'project.timeline': ['read_only', 'editor', 'admin'],
  'project.summary': ['read_only', 'editor', 'admin'],
  'project.specs': ['read_only', 'editor', 'admin'],
  'project.kit_status': ['read_only', 'editor', 'admin'],
  'project.download_kit': ['read_only', 'editor', 'admin'],
  'project.list_api_tokens': ['read_only', 'editor', 'admin'],
  'project.check_for_updates': ['read_only', 'editor', 'admin'],
  'project.submit_feedback': ['read_only', 'editor', 'admin'], // [SCOPE 043 / T002] any signed-in user can report a bug
  'project.list_my_feedback': ['read_only', 'editor', 'admin'], // [SCOPE 043 / T007] own items
  'project.answer_feedback': ['read_only', 'editor', 'admin'], // [SCOPE 043 / T007] answer own needs-info
  'project.triage_feedback': ['read_only', 'editor', 'admin'], // [SCOPE 043 / T011b] mark own item triaged
  'project.update_feedback_status': ['editor', 'admin'], // [SCOPE 043 / T021] vendor status transitions; sink ownership enforced in handler
  'project.manage_my_feedback': ['read_only', 'editor', 'admin'], // [SCOPE 110 / T011] hide/unhide/delete OWN submissions (ownership enforced in-query)
  'project.list_scope_seeds': ['editor', 'admin'], // [SCOPE 043 / T017] sink-only; devs materialize seeds
  'project.record_scope_materialized': ['editor', 'admin'], // [SCOPE 043 / T017] sink-only; report assigned NNN
  'project.get_stack': ['read_only', 'editor', 'admin'], // [SCOPE 055] read the project's ProjectStack doc
  'project.search_capabilities': ['read_only', 'editor', 'admin'], // [SCOPE 074] semantic reuse search (read)
  'project.get_entitlement': ['read_only', 'editor', 'admin'], // Phase 1B — signed entitlement token for kit preflight
  'project.get_command_prompt': ['read_only', 'editor', 'admin'], // Phase 2 — server-delivered premium methodology (entitlement-gated)
  'project.get_audit_config': ['read_only', 'editor', 'admin'], // BUG-2026-07-18 (Minor 2): handler existed but tool was missing here → checkPermission threw "Unknown tool"; needed by the buildscope/createSpecs compliance-context step
  'project.get_compliance_context': ['read_only', 'editor', 'admin'], // [SCOPE 112 / T009] Amendment A — rule content served from the DB; read-only, same audience as get_audit_config it follows
  'project.scope_stage': ['read_only', 'editor', 'admin'], // [SCOPE 123 / T018] a named scope's stage, open tasks and open gates (the kit's gate reads it)

  // Editor tools
  'project.upsert_document': ['editor', 'admin'],
  'project.create_task': ['editor', 'admin'],
  'project.update_task_status': ['editor', 'admin'],
  'project.link_task_to_spec': ['editor', 'admin'], // [SCOPE 101 / T003] re-parent existing tasks to a spec
  'project.backfill_scope_stages': ['editor', 'admin'], // [SCOPE 123 / T018] FR-007 backfill; dry run unless confirm:true
  'project.update_task': ['editor', 'admin'], // [SCOPE 101 / T014] patch task content
  // [SCOPE 101 / T015] Editor, not admin-only: agent tokens are editor, and the
  // handler's cascade guard — not the role — is what makes deletion safe.
  'project.delete_task': ['editor', 'admin'],
  'project.update_spec_status': ['editor', 'admin'], // [SCOPE 101 / T004] spec lifecycle transition
  'project.index_capabilities': ['editor', 'admin'], // [SCOPE 074] (re)index a unit's capabilities (write)
  'project.set_scope_dependencies': ['editor', 'admin'], // [SCOPE 073] capture a scope's dependency edges (write)
  'project.link_doc_to_task': ['editor', 'admin'],
  'project.create_specs': ['editor', 'admin'],
  'project.merge_scope': ['editor', 'admin'], // [SCOPE 058 dedup] merge a duplicate spec row into a keeper
  // [SCOPE 098 / T007] Permanent deletion. Deliberately NOT admin-only: it matches the
  // web route's authorization, which editors have had since T001, and an MCP tool that
  // is stricter than the UI beside it invites the UI being used to route around it.
  'project.delete_scope': ['editor', 'admin'],
  // [SCOPE 134 / T009] Recording an override decision. An audit write, not an approval —
  // the approval happened in the room, by a human. Gated further on clientbinding in the
  // handler, so only a bound agent can file one.
  'project.record_override': ['editor', 'admin'],
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

  // [SCOPE 111 / T028] Test Suite Lifecycle. A tool advertised in server.ts but
  // MISSING here is reported as an unknown tool at call time, so these entries
  // are not optional bookkeeping — they are half of what registers a tool. The
  // parity test in tests/unit/tool-matrix-parity.test.ts fails if the two lists
  // ever drift apart again.
  'project.upsert_test_plan': ['editor', 'admin'],
  'project.start_test_run': ['editor', 'admin'],
  'project.report_test_progress': ['editor', 'admin'],
  'project.complete_test_run': ['editor', 'admin'],
  'project.sign_off_test': ['editor', 'admin'],
  'project.report_change_impact': ['editor', 'admin'],
  // Read-only: the release commands and the Cockpit ask this before promoting.
  'project.test_gate_status': ['read_only', 'editor', 'admin'],
  // [SCOPE 151 / T005] Read-only: which project agents are connected; the token decides the reach.
  'project.list_agent_connections': ['read_only', 'editor', 'admin'],

  // Update tools
  'project.upgrade_mcp': ['admin'],
  
  // Admin-only tools (future)
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
