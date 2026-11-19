// Local wrapper around the kit's policy adapter. The `postbuild` script
// uses esbuild to bundle wxkanban-agent/core/policy/adapters/mcp-adapter.ts
// (and its transitive deps in core/policy + core/schemas) into a single
// CJS file at dist/_kit/mcp-adapter.cjs. Necessary because the kit ships
// .ts only (.js is gitignored), so App Runner sees no compiled artifacts
// to copy. Bundling produces a self-contained module with no runtime
// path dependency on wxkanban-agent/.
// Restores the wrapper boundary that spec 030 Slice C (commit b58c771)
// deleted. Behavior is identical: enforceTool() delegates to the kit.
//
// SCOPE-123 — the kit now gates on the stage of the SCOPE the tool call names,
// so the call's arguments travel with it, and this server's test gate goes too
// so a refusal can name an open gate (FR-010).

import { createRequire } from 'module';
import type { Pool } from 'pg';

const require = createRequire(import.meta.url);

// SCOPE-123 FR-004 — machine-readable refusal; `code` is what a caller branches on.
export interface StageRefusal {
  code: 'STAGE_DENIED' | 'SCOPE_INACTIVE' | 'SCOPE_REQUIRED' | 'UNKNOWN_COMMAND' | 'SPEC_UNVERIFIED' | 'ESCALATION_DENIED';
  command: string;
  scope?: {
    scopeId: string | null;
    specNumber: string;
    label: string;
    stage: string;
    taskCount: number;
    openTaskCount: number;
    blockers: Array<{ kind: string; message: string }>;
    tracked?: boolean;
    inactive?: boolean;
  };
  requiredStages?: string[];
  availableCommands?: string[];
}

export interface StageEnforcementResult {
  allowed: boolean;
  // The named scope's stage; null for tools that act on no scope.
  currentStage: string | null;
  requestedTool: string;
  reason?: string;
  refusal?: StageRefusal;
}

type ScopeGateChecker = (q: {
  projectId: string;
  scopeId: string;
  requirement: 'ai' | 'user' | 'all';
}) => Promise<{ passed: boolean; skipped: boolean; itemCount: number; blocking: Array<{ itemKey: string; title: string; why: string }> }>;

interface KitMcpAdapter {
  enforceTool(
    db: Pool,
    projectId: string,
    toolName: string,
    options?: { args?: Record<string, unknown>; gates?: ScopeGateChecker; boundProjectId?: string },
  ): Promise<StageEnforcementResult>;
}

const adapter: KitMcpAdapter = require('../_kit/mcp-adapter.cjs');

// [SCOPE 123 / T002] BEGIN — enforceTool: per-scope gate, with the call's args and this server's test gate
export async function enforceTool(
  db: Pool,
  projectId: string,
  toolName: string,
  options: { args?: Record<string, unknown>; gates?: ScopeGateChecker; boundProjectId?: string } = {},
): Promise<StageEnforcementResult> {
  return adapter.enforceTool(db, projectId, toolName, options);
}
// [SCOPE 123 / T002] END
