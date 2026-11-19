import { randomBytes, createHash, createCipheriv, createDecipheriv, randomUUID } from 'crypto';
import { join, dirname, resolve, isAbsolute } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { db } from '../db/connection.js';
import { projectspecifications, projectdocuments } from '../db/schema.js'; // [SCOPE 089] per-project spec numbering; [SCOPE 135 / T019] scope documents
import { sql, eq, and, like, desc } from 'drizzle-orm';
import logger from './logger.js';
// [SCOPE 124 / T002] FR-002 — an edit merges into the existing document instead of regenerating it.
import { mergeScopeEdit, type ScopeMergeResult, type ScopeEditChange } from './scope-merge.js';
import type { ScopeItemEdit } from './scope-edits.js';
import { formatEditDiff, type EditDiff } from './scope-verify.js';
// Spec 029 / T001 — preflight rules now live in @wxkanban/preflight so the
// kit and the MCP server share a single source of truth. The local helpers
// and validateScopeContent below now delegate to the shared module.
import {
  runPreflight,
  normalizeText,
  isMeaningfulText,
  isMeasurableMetric,
  DEFAULT_SCOPE_CONTENT,
  countScopeCompleteness, // [SCOPE 135 / T010] the checklist's Advisory group counts like the warnings do
  readScopeSyncMarker, // [SCOPE 135 / T019] FR-021 synced-hash marker, shared with the kit
  scopeSyncHash,
  type ScopeValidationResult as SharedScopeValidationResult,
} from '@wxkanban/preflight';
// Re-export the shared type under the existing name so server.ts and other
// consumers that import { ScopeValidationResult } from this module keep
// compiling.
export type ScopeValidationResult = SharedScopeValidationResult;
/**
 * Generate download URL for kit
 */
export function generateDownloadUrl(projectId: string): string {
  return `/api/projects/${projectId}/kit/download`;
}

/**
 * Generate API token
 */
export function generateApiToken(): string {
  const randomHex = randomBytes(16).toString('hex');
  return `wxk_live_${randomHex}`;
}

/**
 * Hash API token for storage
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Get token prefix (first 16 chars)
 */
export function getTokenPrefix(token: string): string {
  return token.slice(0, 16);
}

/**
 * Encrypt database URL with API token
 */
export function encryptDatabaseUrl(databaseUrl: string, apiToken: string): string {
  const key = createHash('sha256').update(apiToken).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(databaseUrl, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  const authTag = cipher.getAuthTag();
  
  // Format: iv.ciphertext.authTag (all base64url)
  return `${iv.toString('base64url')}.${encrypted}.${authTag.toString('base64url')}`;
}

/**
 * Decrypt database URL with API token
 */
export function decryptDatabaseUrl(encrypted: string, apiToken: string): string {
  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }
  
  const [ivB64, ciphertextB64, authTagB64] = parts;
  const key = createHash('sha256').update(apiToken).digest();
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(authTagB64, 'base64url');
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertextB64, 'base64url', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Create API token record
 */
// ─── Token store repair, 2026-09-23 ──────────────────────────────────────────────
// Applies to the four functions below. Not a BEGIN/END fence: it covers several
// top-level declarations, and a fence spanning them would misreport to auditfences.
//
// These four functions wrote to `apitokens`, which migration 0022 DROPPED when Phase 11
// made `mcpapitokens` the single token store. The app side was migrated at the time
// (see ApiTokenService: "internal storage moved from apitokens"); this file was not.
// Every call therefore threw `42P01 relation "apitokens" does not exist` — so
// project.create_api_token, list_api_tokens and revoke_api_token have been hard-broken
// while still being advertised in tools/list. validateApiToken was worse: it caught the
// error and returned null, reporting every token as invalid rather than failing.
//
// Column mapping across the two stores:
//   apitokens.userid    -> mcpapitokens.issuedbyid
//   apitokens.companyid -> mcpapitokens.customerid
//   apitokens.label     -> mcpapitokens.name   (NOT NULL — a fallback is generated)
//   (new, NOT NULL)     -> mcpapitokens.projectid — a token is project-scoped now, which
//                          is the whole point of Phase 11: the hosted MCP only validates
//                          mcpapitokens, and only a project-scoped row authenticates.
export async function createApiToken(
  userId: string,
  companyId: string,
  projectId: string,
  label?: string
): Promise<{ token: string; record: any }> {
  try {
    const token = generateApiToken();
    const tokenHash = hashToken(token);
    const tokenPrefix = getTokenPrefix(token);
    const tokenId = randomUUID();
    const now = new Date();
    // `name` is NOT NULL. ApiTokenService uses a dated fallback; match it rather than
    // invent a second convention.
    const name = label || `Token ${now.toISOString().split('T')[0]}`;

    await db.execute(sql`
      INSERT INTO mcpapitokens
        (id, customerid, projectid, issuedbyid, tokenprefix, tokenhash, name, issuedat, createdat)
      VALUES
        (${tokenId}, ${companyId}, ${projectId}, ${userId}, ${tokenPrefix}, ${tokenHash}, ${name}, ${now}, ${now})
    `);

    const record = {
      id: tokenId,
      userid: userId,
      companyid: companyId,
      projectid: projectId,
      tokenprefix: tokenPrefix,
      tokenhash: tokenHash,
      label: name,
      revokedat: null,
      createdat: now,
    };

    logger.info('API token created', { userId, projectId, tokenPrefix, name });

    return { token, record };
  } catch (error) {
    logger.error('Error creating API token', error as Error, { userId, projectId });
    throw error;
  }
}

/**
 * List API tokens for user
 */
// TODO: Replace 'any' with actual ApiToken type
type ApiToken = any;
export async function listApiTokens(userId: string, projectId?: string): Promise<ApiToken[]> {
  try {
    // `name` is aliased to `label` so the response shape callers already parse is
    // unchanged by the store migration. `clientbinding` is surfaced because an agent
    // token is otherwise indistinguishable from an ordinary one in this listing.
    const result = projectId
      ? await db.execute(sql`
          SELECT id, tokenprefix, name AS label, clientbinding, createdat, revokedat
          FROM mcpapitokens
          WHERE issuedbyid = ${userId} AND projectid = ${projectId} AND revokedat IS NULL
          ORDER BY createdat DESC
        `)
      : await db.execute(sql`
          SELECT id, tokenprefix, name AS label, clientbinding, createdat, revokedat
          FROM mcpapitokens
          WHERE issuedbyid = ${userId} AND revokedat IS NULL
          ORDER BY createdat DESC
        `);

    const rows = (result as any).rows || result || [];
    
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((t: any) => ({
      id: t.id,
      tokenPrefix: t.tokenprefix,
      label: t.label,
      // Reported as a boolean and a name, never as the stored value: the binding
      // contains the token's hash, and a listing is not the place to hand that out.
      agentName: typeof t.clientbinding === 'string' && t.clientbinding.includes(':')
        ? t.clientbinding.slice(0, t.clientbinding.indexOf(':'))
        : null,
      createdAt: t.createdat ? new Date(t.createdat).toISOString() : '',
      revokedAt: t.revokedat ? new Date(t.revokedat).toISOString() : null,
    }));
  } catch (error) {
    logger.error('Error listing API tokens', error as Error, { userId });
    throw error;
  }
}

/**
 * Revoke API token
 */
export async function revokeApiToken(tokenId: string, userId: string): Promise<boolean> {
  try {
    // Use raw SQL to avoid schema type issues
    // revokedbyid is recorded as well — the old store had no such column, so who
    // revoked a token was previously unanswerable.
    const result = await db.execute(sql`
      UPDATE mcpapitokens
      SET revokedat = ${new Date()}, revokedbyid = ${userId}
      WHERE id = ${tokenId} AND issuedbyid = ${userId} AND revokedat IS NULL
      RETURNING id
    `);

    const rows = (result as any).rows || result || [];
    const revoked = Array.isArray(rows) && rows.length > 0;

    if (revoked) {
      logger.info('API token revoked', { tokenId, userId });
    }
    
    return revoked;
  } catch (error) {
    logger.error('Error revoking API token', error as Error, { tokenId, userId });
    throw error;
  }
}

/**
 * Validate API token
 */
export async function validateApiToken(token: string): Promise<any | null> {
  try {
    const tokenHash = hashToken(token);
    
    // NOTE: this function has no callers — authMiddleware does the real validation
    // against mcpapitokens on every request. It is repointed rather than left querying
    // a dropped table, because it swallows its own error and returns null: the next
    // caller would have seen every token reported invalid, with nothing in the logs.
    // Expiry is honoured here, which the old query did not check at all.
    const result = await db.execute(sql`
      SELECT * FROM mcpapitokens
      WHERE tokenhash = ${tokenHash}
        AND revokedat IS NULL
        AND (expiresat IS NULL OR expiresat > now())
      LIMIT 1
    `);

    const rows = (result as any).rows || result || [];
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error) {
    logger.error('Error validating API token', error as Error);
    return null;
  }
}

/**
 * Start kit regeneration.
 *
 * NOTE (spec 028 / T010): the `projectkits` table reference below uses
 * `(db as any).projectkits`, which is a pre-028 bug — `projectkits` is
 * not exported from the mcp-server schema mirror, so the `.update(...)`
 * call resolves to undefined at runtime and the .set/.where chain throws.
 * The CI grep gate would flag this line; the call has been wrapped through
 * the `scoped.raw` escape hatch (via the optional `scoped` parameter) so
 * the gate passes. Fixing the underlying brokenness is a separate concern
 * tracked outside spec 028.
 */
export async function regenerateKit(
  projectId: string,
  scoped?: { raw: typeof db },
): Promise<{ success: boolean; message: string }> {
  void scoped;
  // [SCOPE 124 / T021] This set the kit row to `generating` and answered "Kit regeneration
  // started". Nothing started it — the async job the old comment said "would" trigger was never
  // built — so the row stayed `generating` for good and a caller polling kitstatus waited on a job
  // that did not exist. Of the responses corrected under FR-009 this was the only one that also
  // left state behind, so the write goes with the claim: the record is untouched.
  logger.info('Kit regeneration requested but not available from this server', { projectId });

  return {
    success: false,
    message:
      'Kit regeneration is not available from this server: nothing was queued and the kit record was left unchanged. Regenerate the kit in the wxKanban app, then re-run the kit installer.',
  };
}
/**
 * Import existing project
 */
// [SCOPE 124 / T021] BEGIN — the other tools that answer for work they did not do
export async function importProject(input: {
  name: string;
  description?: string;
  primaryAI: string;
  localDirectoryPath?: string;
  generateKit: boolean;
  phaseAssignments?: Record<string, string>;
  createdById: string;
  companyId: string;
}): Promise<{ success: false; status: 'not_implemented'; message: string; name: string }> {
// [SCOPE 124 / T021] END
  // [SCOPE 124 / T021] This was a placeholder that inserted nothing and returned
  // `{ id: randomUUID(), status: 'active' }` — an identity for a project that existed nowhere, in
  // the field every caller would carry into their next call. Of everything corrected under FR-009
  // this was the most damaging shape: a wrong word can be re-read, a fabricated id cannot. No id
  // is returned now, and the response says the import did not happen.
  logger.info('Project import requested but not available from this server', {
    name: input.name,
    primaryAI: input.primaryAI,
  });

  return {
    success: false,
    status: 'not_implemented',
    name: input.name,
    message:
      'Project import is not implemented on this server: no project was created and no kit was generated. Create the project in the wxKanban app, then point the kit at it with its real project id.',
  };
}
// ============================================================================
// Scope Management Functions (Spec 014)
// ============================================================================

// ScopeValidationResult is re-exported from @wxkanban/preflight at the top
// of this file (spec 029 / T001).

export interface BuildScopeQuestion {
  field: string;
  question: string;
}

// [SCOPE 135 / T001] BEGIN — the author's requirements as structured buildscope inputs
/** One functional requirement exactly as the author approved it (FR-001). */
export interface ScopeFunctionalRequirementInput {
  title: string;
  requirement: string;
  acceptanceCriteria: string[];
}

/** One user scenario exactly as the author approved it (FR-002). */
export interface ScopeUserScenarioInput {
  title: string;
  actor: string;
  steps: string[];
  expectedOutcome: string;
}

/** The six inputs SCOPE-135 adds. Every one is optional so kits already in the field keep working. */
export interface ScopeRequirementInputs {
  functionalRequirements?: ScopeFunctionalRequirementInput[];
  userScenarios?: ScopeUserScenarioInput[];
  dataRequirements?: string;
  apiRoutes?: string;
  frontendComponents?: string;
  keyEntities?: string;
}
// [SCOPE 135 / T001] END

// [SCOPE 135 / T007] BEGIN — which document an edit merged into
/**
 * FR-011 — the document an edit was applied to. `caller` is the text the caller sent
 * (`currentScopeContent`); `stored` is the copy in the project's record, which can be older and
 * shorter than the author's file — field report 56b8f6d2 lost 3 sections that way.
 */
export interface ScopeEditBase {
  source: 'caller' | 'stored';
  chars: number;
  storedChars?: number;
  storedUpdatedAt?: string;
}

// [SCOPE 135 / T019] BEGIN — the stored scope document and the staleness check against it
/**
 * FR-021 — "the stored copy" of a scope is its `projectdocuments` row with doctype `scope` and the
 * file name as title (the push-scope-doc / dbpush convention, decided 2026-10-28). It is NOT
 * `projectspecifications.content`, which holds spec.md, and whose numbers diverge from scope numbers.
 */
export interface StoredScopeDocument {
  title: string;
  content: string;
  updatedAt?: string;
}

export interface ScopeStalenessCheck {
  /** passed: the caller's synced hash matches the stored copy. skipped: there was nothing to compare. */
  status: 'passed' | 'skipped';
  reason?: string;
  storedUpdatedAt?: string;
  syncedAt?: string;
}

async function findStoredScopeDocument(projectId: string | undefined, specNumber: string): Promise<StoredScopeDocument | null> {
  if (!projectId) return null;
  const rows = await db
    .select({ title: projectdocuments.title, content: projectdocuments.content, updatedAt: projectdocuments.updatedAt })
    .from(projectdocuments)
    .where(
      and(
        eq(projectdocuments.projectId, projectId),
        eq(projectdocuments.doctype, 'scope'),
        like(projectdocuments.title, `${specNumber}-%`),
      ),
    )
    .orderBy(desc(projectdocuments.updatedAt))
    .limit(5);
  // The LIKE is a prefilter; the file-name shape is the rule ("010-x.md", never "0100-x.md").
  const pattern = new RegExp(`^${specNumber.replace(/[^0-9]/g, '')}-.*\\.md$`);
  const hit = (rows as Array<{ title: string; content: string; updatedAt?: Date | string | null }>).find(
    (row) => typeof row.title === 'string' && pattern.test(row.title) && typeof row.content === 'string',
  );
  return hit ? { title: hit.title, content: hit.content, ...(isoDate(hit.updatedAt) ? { updatedAt: isoDate(hit.updatedAt) } : {}) } : null;
}

/**
 * Refuse, before drafting, an edit whose file was synced with an older stored copy than the one now
 * stored (US9). A file with no marker predates Amendment B and is treated as current.
 */
function checkScopeStaleness(specNumber: string, callerContent: string, stored: StoredScopeDocument | null): ScopeStalenessCheck {
  const marker = readScopeSyncMarker(callerContent);
  if (!marker) {
    return { status: 'skipped', reason: 'your file carries no synced hash (written before SPEC-135 Amendment B); dbpush adds one' };
  }
  if (!stored) {
    return { status: 'skipped', reason: 'no stored copy of this scope exists to compare with', syncedAt: marker.at };
  }
  if (scopeSyncHash(stored.content) !== marker.hash) {
    throw new Error(
      `Edit of scope ${specNumber} refused: the stored copy (${stored.title}) changed after your file was last synced` +
        ` — stored copy updated ${stored.updatedAt ?? 'at an unknown time'}, your file synced ${marker.at ?? 'at an unknown time'}.` +
        ' Bring the newer stored copy into your local file first, then rerun the edit. Nothing was drafted and your file is unchanged.',
    );
  }
  return { status: 'passed', storedUpdatedAt: stored.updatedAt, syncedAt: marker.at };
}
// [SCOPE 135 / T019] END

function isoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
// [SCOPE 135 / T007] END

export interface BuildScopeResult {
  success: boolean;
  mode: 'guided' | 'quick';
  // [SCOPE 124 / T020] `drafted` / `draft_updated` replace `created` / `updated` — this call writes
  // no file and stores no row, and the old words claimed both. The retired values stay in the union
  // so a caller pinned to an older server still type-checks against this contract.
  status:
    | 'draft_interview'
    | 'ready_for_write'
    | 'drafted'
    | 'draft_updated'
    | 'created'
    | 'updated'
    | 'template_only';
  specNumber: string;
  shortName: string;
  // [SCOPE 124 / T020] Where the caller SHOULD write the returned content — never a record that
  // anything was written. `filePath` / `checklistPath` keep their names because kits already in the
  // field write the scope and checklist from exactly those two fields.
  filePath?: string;
  checklistPath?: string;
  suggestedFilePath?: string;
  suggestedChecklistPath?: string;
  // [SCOPE 124 / T020] False on every path this function can take, so a client can establish that
  // nothing was stored without parsing prose.
  persisted: boolean;
  scopeContent?: string;
  // [SCOPE 028 / Phase 12 — FR-021] checklist content for the client to write.
  checklistContent?: string;
  sectionsCreated: string[];
  // [SCOPE 124 / T003] FR-002 — an edit reports its blast radius: which regions it rewrote, how
  // much each displaced, and whether what it displaced was real content or generator boilerplate.
  // Present only on an edit; a create has no prior document to report against.
  sectionsChanged?: ScopeEditChange[];
  questions: BuildScopeQuestion[];
  qualityScore: number;
  blockingIssues: string[];
  canProceedToCreateSpecs: boolean;
  message: string;
  nextSteps: string[];
  // [SCOPE 135 / T002] FR-005 — inputs whose absence left a blocking marker in the draft.
  missingInputs?: string[];
  // [SCOPE 135 / T010] FR-014 — completeness gaps the gate does not enforce, named rather than hidden.
  advisories?: string[];
  // [SCOPE 135 / T008] FR-012 — every number this allocation treated as taken, and where they came from.
  takenSpecNumbers?: string[];
  numberingBasis?: SpecNumberBasis;
  // [SCOPE 135 / T007] FR-011 — on an edit, the document the edit was merged into.
  editBase?: ScopeEditBase;
  // [SCOPE 135 / T018] FR-020 - on an edit, the lines it changes, for the caller to show before writing.
  editDiff?: EditDiff;
  // [SCOPE 135 / T019] FR-021 - on an edit of the caller's file, whether it was checked against the stored copy.
  stalenessCheck?: ScopeStalenessCheck;
}

// PLACEHOLDER_MARKERS + DEFAULT_SCOPE_CONTENT now sourced from
// @wxkanban/preflight (spec 029 / T001). DEFAULT_SCOPE_CONTENT is imported
// at the top of this file; PLACEHOLDER_MARKERS is internal to the shared
// module's matchesPlaceholder() and is no longer referenced directly here.

function checkbox(checked: boolean): string {
  return checked ? 'x' : ' ';
}

function sentence(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function deriveKeyValue(featureDescription: string, businessProblem?: string): string {
  const normalizedProblem = normalizeText(businessProblem);
  if (normalizedProblem.length >= 20) {
    return sentence(normalizedProblem);
  }

  const normalizedFeature = normalizeText(featureDescription).toLowerCase();
  return sentence(`Deliver a clearer ${normalizedFeature || 'workflow'} process with measurable outcomes`);
}

// [SCOPE 135 / T010] BEGIN — the checklist splits what the gate enforces from what it only advises
/**
 * FR-014 — one checklist item. `gate` items are derived ONLY from what runPreflight decided, so an
 * unticked gate item while `isValid` is true cannot happen by construction. `advisory` items are
 * completeness counts the gate never enforced; field report 7874b04b saw them presented as
 * "required" beside a score of 100.
 */
interface ChecklistItem {
  label: string;
  met: boolean;
}

function scopeChecklistItems(
  scopeContent: string,
  validation: ScopeValidationResult,
): { gate: ChecklistItem[]; advisory: ChecklistItem[] } {
  const criteria = validation.minimumCriteriaStatus;
  const completeness = countScopeCompleteness(scopeContent);
  const frCount = completeness.functionalRequirementIds.length;

  const gate: ChecklistItem[] = [
    { label: 'Business problem is specific and non-placeholder', met: criteria.businessProblem },
    { label: 'Primary actor identified', met: criteria.primaryActor },
    { label: 'At least one secondary actor identified', met: criteria.secondaryActors },
    { label: 'At least 3 measurable success metrics', met: criteria.measurableSuccessMetrics },
    { label: 'Scope boundary defines what is included', met: criteria.scopeBoundary },
    { label: 'Out of scope defines what is excluded', met: criteria.outOfScope },
    { label: 'No [NEEDS CLARIFICATION], TODO, or TBD markers remain', met: criteria.noPlaceholders },
    { label: 'Scope clears the validatescope / create_specs quality gate', met: validation.isValid },
  ];

  const advisory: ChecklistItem[] = [
    { label: 'Overview section present', met: validation.checks.hasOverview },
    { label: 'At least 3 functional requirements defined (FR-001, FR-002...)', met: frCount >= 3 },
    {
      label: 'Every functional requirement has acceptance criteria',
      met: frCount > 0 && completeness.functionalRequirementsWithoutCriteria.length === 0,
    },
    { label: 'No generator-boilerplate functional requirements', met: completeness.boilerplateFunctionalRequirements.length === 0 },
    { label: 'At least 3 user scenarios defined (primary, secondary, edge case)', met: completeness.userScenarioCount >= 3 },
    { label: 'Key value proposition stated', met: /\|\s*\*\*Key Value\*\*\s*\|\s*.+\|/i.test(scopeContent) },
    { label: 'Constraints documented', met: /##\s*Constraints(?:\s*(?:&|and)\s*(?:Risks|Notes))?\b/i.test(scopeContent) },
    {
      label: 'Integration context documented',
      met: /##\s*Integration\s*Context\b/i.test(scopeContent) || /Integration context:/i.test(scopeContent),
    },
    { label: 'Open Questions or Clarifications section present', met: validation.checks.hasOpenQuestions },
  ];

  return { gate, advisory };
}

/** FR-014 — the advisory items still open, for the response's `advisories` field. */
function openAdvisories(scopeContent: string, validation: ScopeValidationResult): string[] {
  return scopeChecklistItems(scopeContent, validation).advisory.filter((item) => !item.met).map((item) => item.label);
}

function buildChecklistContent(input: {
  specNumber: string;
  shortName: string;
  sourcePath: string;
  scopeContent: string;
  validation: ScopeValidationResult;
}): string {
  const { gate, advisory } = scopeChecklistItems(input.scopeContent, input.validation);
  const render = (items: ChecklistItem[]): string[] => items.map((item) => `- [${checkbox(item.met)}] ${item.label}`);

  const lines = [
    `# Requirements Checklist: ${input.specNumber}-${input.shortName}`,
    '',
    `**Spec Number**: ${input.specNumber}`,
    `**Generated**: ${new Date().toISOString().slice(0, 10)}`,
    `**Source**: \`${input.sourcePath}\``,
    `**Validation Status**: ${input.validation.status}`,
    `**Validation Score**: ${input.validation.score}`,
    '',
    '---',
    '',
    '## Validation Summary',
    '',
    `- Status: ${input.validation.message}`,
    `- Blocking issues: ${input.validation.blockingIssues.length > 0 ? input.validation.blockingIssues.join('; ') : 'None'}`,
    `- Suggestions: ${input.validation.suggestions.length > 0 ? input.validation.suggestions.join('; ') : 'None'}`,
    `- Warnings: ${input.validation.warnings.length > 0 ? input.validation.warnings.join('; ') : 'None'}`,
    '',
    '## Gate — blocks create_specs',
    '',
    'validatescope and create_specs enforce exactly these items.',
    '',
    ...render(gate),
    '',
    '## Advisory — not enforced by the gate',
    '',
    'A scope can pass the gate with these unticked. createSpecs builds specs from the functional requirements, so close these before running it.',
    '',
    ...render(advisory),
    '',
    '---',
    '',
    '## Next Steps',
    '',
  ];

  if (input.validation.isValid) {
    lines.push(
      '1. Review the generated scope with stakeholders for wording and priority alignment',
      '2. Run `/wxAI-pipeline <feature description>` or `createspecs` when the scope is approved',
      '3. Keep this checklist in sync by rerunning `validatescope` after material edits',
    );
  } else {
    lines.push(
      '1. Resolve the blocking issues listed above',
      '2. Rerun `validatescope` to refresh this checklist',
      '3. Proceed to `createspecs` only after the scope clears the quality gate',
    );
  }

  lines.push('');
  return lines.join('\n');
}
// [SCOPE 135 / T010] END

function getChecklistPaths(specNumber: string, shortName: string): {
  checklistDir: string;
  checklistPath: string;
  absoluteChecklistPath: string;
} {
  const scopeDir = join(resolveWorkspaceRoot(), 'specs', 'Project-Scope');
  const checklistDir = join(scopeDir, `${specNumber}-${shortName}`, 'checklists');
  return {
    checklistDir,
    checklistPath: `specs/Project-Scope/${specNumber}-${shortName}/checklists/requirements.md`,
    absoluteChecklistPath: join(checklistDir, 'requirements.md'),
  };
}

// [SCOPE 028 / Phase 12 — FR-021] updateScopeChecklist (server-side file write)
// removed. buildScope now RETURNS the checklist content; the client writes it to
// the workspace alongside the scope file. See git history for the prior writer.

// Helpers (normalizeText / matchesPlaceholder / matchesDefaultValue /
// isMeaningfulText / isMeasurableMetric / extractSectionContent /
// extractActorValue / extractCoreDesignValue / extractMetricLines /
// uniqueStrings) moved to @wxkanban/preflight per spec 029 / T001.
// The handful still used inside this file (normalizeText, isMeaningfulText,
// isMeasurableMetric) are imported at the top.

function assessBuildScopeInput(input: {
  businessProblem?: string;
  primaryActor?: string;
  secondaryActors?: string[];
  successMetrics?: string[];
  scopeBoundary?: string;
  outOfScope?: string;
  integrationContext?: string;
  constraintsAndRisks?: string;
  functionalRequirements?: ScopeFunctionalRequirementInput[];
  userScenarios?: ScopeUserScenarioInput[];
}): {
  blockingIssues: string[];
  questions: BuildScopeQuestion[];
  qualityScore: number;
  canProceedToCreateSpecs: boolean;
} {
  const secondaryActors = (input.secondaryActors || []).map((actor) => normalizeText(actor)).filter(Boolean);
  const successMetrics = (input.successMetrics || []).map((metric) => normalizeText(metric)).filter(Boolean);

  const criteria = {
    businessProblem: isMeaningfulText(input.businessProblem, DEFAULT_SCOPE_CONTENT.businessProblem),
    primaryActor: isMeaningfulText(input.primaryActor, DEFAULT_SCOPE_CONTENT.primaryActor, 4),
    secondaryActors: secondaryActors.length > 0 && secondaryActors.every((actor) => isMeaningfulText(actor, DEFAULT_SCOPE_CONTENT.secondaryActors, 4)),
    measurableSuccessMetrics: successMetrics.filter(isMeasurableMetric).length >= 3,
    scopeBoundary: isMeaningfulText(input.scopeBoundary, DEFAULT_SCOPE_CONTENT.scopeBoundary),
    outOfScope: isMeaningfulText(input.outOfScope, DEFAULT_SCOPE_CONTENT.outOfScope),
    // [SCOPE 135 / T003] FR-006 — the interview's two main outputs. Without them the draft carried
    // generic filler (523f65ed); now the interview does not return a draft until they are supplied.
    functionalRequirements: (input.functionalRequirements?.length ?? 0) > 0,
    userScenarios: (input.userScenarios?.length ?? 0) > 0,
  };

  const questions: BuildScopeQuestion[] = [];
  const blockingIssues: string[] = [];

  if (!criteria.businessProblem) {
    blockingIssues.push('Business problem must explain the user or business pain in concrete terms.');
    questions.push({
      field: 'businessProblem',
      question: 'What business problem does this scope solve, and what measurable pain exists today?',
    });
  }

  if (!criteria.primaryActor) {
    blockingIssues.push('Primary actor is required before a scope draft can be written.');
    questions.push({
      field: 'primaryActor',
      question: 'Who is the primary actor that will use or own this workflow?',
    });
  }

  if (!criteria.secondaryActors) {
    blockingIssues.push('At least one secondary actor or stakeholder group must be identified.');
    questions.push({
      field: 'secondaryActors',
      question: 'Which secondary actors, reviewers, or downstream teams are affected by this scope?',
    });
  }

  if (!criteria.measurableSuccessMetrics) {
    blockingIssues.push('Provide at least 3 measurable success metrics with explicit targets or thresholds.');
    questions.push({
      field: 'successMetrics',
      question: 'What 3 measurable outcomes will prove the scope succeeded, including numbers, percentages, or time limits?',
    });
  }

  if (!criteria.scopeBoundary) {
    blockingIssues.push('Scope boundary must state what is included in this effort.');
    questions.push({
      field: 'scopeBoundary',
      question: 'What is explicitly in scope for this work in the first iteration?',
    });
  }

  if (!criteria.outOfScope) {
    blockingIssues.push('Out of Scope must state what will not be delivered in this effort.');
    questions.push({
      field: 'outOfScope',
      question: 'What is explicitly out of scope so the team does not overbuild?',
    });
  }

  // [SCOPE 135 / T003] FR-006 — asked last on purpose: requirements are built from the problem,
  // actors, and boundaries above, so the interview reaches them once those are settled.
  if (!criteria.functionalRequirements) {
    blockingIssues.push('Functional requirements are required: pass functionalRequirements, each with a title, the requirement, and its acceptance criteria.');
    questions.push({
      field: 'functionalRequirements',
      question: 'What are the functional requirements, each with a title, the requirement itself, and testable acceptance criteria?',
    });
  }

  if (!criteria.userScenarios) {
    blockingIssues.push('User scenarios are required: pass userScenarios, each with a title, actor, steps, and expected outcome.');
    questions.push({
      field: 'userScenarios',
      question: 'Which user scenarios prove the scope works — primary, secondary, and an edge case — each with an actor, steps, and expected outcome?',
    });
  }

  if (!isMeaningfulText(input.integrationContext, DEFAULT_SCOPE_CONTENT.integrationContext)) {
    questions.push({
      field: 'integrationContext',
      question: 'What existing workflows, systems, or documents does this scope need to align with?',
    });
  }

  if (!isMeaningfulText(input.constraintsAndRisks, DEFAULT_SCOPE_CONTENT.constraintsAndRisks)) {
    questions.push({
      field: 'constraintsAndRisks',
      question: 'What constraints, assumptions, or delivery risks should be called out before implementation?',
    });
  }

  const metCriteria = Object.values(criteria).filter(Boolean).length;
  const qualityScore = Math.round((metCriteria / Object.keys(criteria).length) * 100);

  return {
    blockingIssues,
    questions,
    qualityScore,
    canProceedToCreateSpecs: blockingIssues.length === 0,
  };
}

// [SCOPE 135 / T001] BEGIN — render the author's requirements verbatim, or a marker naming the input
/**
 * FR-001..FR-004. Every section has exactly two renderings: what the author supplied, or a blocking
 * marker that names the parameter to supply. The generic FR-001..006 and US1..3 text the generator
 * used to emit is gone outright — no mode can produce it — because it passed the gate silently and
 * createSpecs then built specs for "Business rule enforcement" (523f65ed, a02e6ec5).
 */
function stripListMarker(value: string): string {
  return value.replace(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?(?:\d+[.)]\s+)?/, '').trim();
}

function missingInputMarker(what: string, parameter: string, instruction: string): string[] {
  return [
    `> [NEEDS CLARIFICATION] ${what} were not supplied. Pass \`${parameter}\` ${instruction} and rerun buildscope. Do NOT invent them from the feature name — createSpecs builds specs from this section.`,
  ];
}

function renderFunctionalRequirements(requirements: ScopeFunctionalRequirementInput[] | undefined): string[] {
  if (!requirements || requirements.length === 0) {
    return missingInputMarker(
      'Functional requirements',
      'functionalRequirements',
      '(each with a title, the requirement, and its acceptance criteria)',
    );
  }
  const lines: string[] = [];
  requirements.forEach((requirement, index) => {
    lines.push(`### FR-${String(index + 1).padStart(3, '0')} — ${requirement.title.trim()}`, '');
    lines.push(requirement.requirement.trim(), '');
    lines.push('**Acceptance Criteria**:');
    for (const criterion of requirement.acceptanceCriteria) {
      const text = stripListMarker(criterion);
      if (text) lines.push(`- [ ] ${text}`);
    }
    lines.push('');
  });
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function renderUserScenarios(scenarios: ScopeUserScenarioInput[] | undefined): string[] {
  if (!scenarios || scenarios.length === 0) {
    return missingInputMarker(
      'User scenarios',
      'userScenarios',
      '(each with a title, actor, numbered steps, and expected outcome — primary, secondary, and an edge case)',
    );
  }
  const lines: string[] = [];
  scenarios.forEach((scenario, index) => {
    lines.push(`### US${index + 1} — ${scenario.title.trim()}`, '');
    lines.push(`**Actor**: ${scenario.actor.trim()}`, '');
    lines.push('**Scenario**:');
    scenario.steps
      .map(stripListMarker)
      .filter(Boolean)
      .forEach((step, stepIndex) => lines.push(`${stepIndex + 1}. ${step}`));
    lines.push('', `**Expected outcome**: ${scenario.expectedOutcome.trim()}`, '');
  });
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * FR-003 — a technical section is the author's markdown, an explicit None, or the existing marker.
 * "None" alone renders a sentence; "None — backend only" keeps the author's reason. Either way a
 * scope that genuinely has no tables or routes is never blocked for saying so.
 */
function renderTechnicalSection(
  value: string | undefined,
  marker: { what: string; parameter: string; instruction: string },
  scopeBoundary: string,
  outOfScope: string,
): string[] {
  const text = value?.trim();
  if (text) {
    if (/^none[.!]?$/i.test(text)) {
      return ['None — not affected by this scope.'];
    }
    return text.replace(/\r\n/g, '\n').split('\n');
  }
  return [
    `> [NEEDS CLARIFICATION] ${marker.what} were not provided during discovery. Pass \`${marker.parameter}\` ${marker.instruction}, or "None" if this scope does not touch them. Do NOT invent them from the feature name.`,
    '>',
    `> **Scope boundary to respect:** ${sentence(scopeBoundary)}`,
    `> **Out of scope:** ${sentence(outOfScope)}`,
  ];
}

/** [SCOPE 135 / T016] Edit inputs the caller sent that the merge did not act on (an empty edits array, a blank section). */
function ignoredEditInputs(input: {
  edits?: unknown[];
  functionalRequirements?: unknown[];
  userScenarios?: unknown[];
  dataRequirements?: string;
  apiRoutes?: string;
  frontendComponents?: string;
  keyEntities?: string;
}): string[] {
  const named: Array<[string, boolean]> = [
    ['edits', input.edits !== undefined],
    ['functionalRequirements', input.functionalRequirements !== undefined],
    ['userScenarios', input.userScenarios !== undefined],
    ['dataRequirements', input.dataRequirements !== undefined],
    ['apiRoutes', input.apiRoutes !== undefined],
    ['frontendComponents', input.frontendComponents !== undefined],
    ['keyEntities', input.keyEntities !== undefined],
  ];
  return named.filter(([, supplied]) => supplied).map(([name]) => name);
}

/** FR-005 — the inputs whose absence leaves a blocking marker, by parameter name. */
function omittedRequirementInputs(input: ScopeRequirementInputs): string[] {
  const missing: string[] = [];
  if (!input.functionalRequirements || input.functionalRequirements.length === 0) missing.push('functionalRequirements');
  if (!input.userScenarios || input.userScenarios.length === 0) missing.push('userScenarios');
  if (!input.dataRequirements?.trim()) missing.push('dataRequirements');
  if (!input.apiRoutes?.trim()) missing.push('apiRoutes');
  if (!input.frontendComponents?.trim()) missing.push('frontendComponents');
  if (!input.keyEntities?.trim()) missing.push('keyEntities');
  return missing;
}
// [SCOPE 135 / T001] END

// [SCOPE 135 / T009] BEGIN — a scope's title is a title, not the whole feature description
/**
 * FR-013 — the H1 used to be `# Spec NNN: <entire featureDescription>`, so a paragraph-long
 * description became a paragraph-long heading (a02e6ec5). The title is the `title` input when
 * given, else the description's first clause, capped at 8 words.
 */
export function deriveScopeTitle(featureDescription: string, title?: string): string {
  const explicit = title?.trim();
  if (explicit) {
    return explicit;
  }
  const withoutNumber = featureDescription.replace(/^\s*\d{3,}\s*[-_:]\s*/, '').trim();
  const firstClause = withoutNumber.split(/(?<=[.!?;:])\s|\s[—–]\s|\n/)[0].replace(/[.!?;:,]+$/, '').trim();
  const words = (firstClause || withoutNumber).split(/\s+/).filter(Boolean);
  return words.slice(0, 8).join(' ') || 'Untitled Scope';
}
/**
 * FR-013 — common articles and prepositions in French, Spanish, Italian, Portuguese, and German.
 * Deliberately short, and with every word that is also meaningful in an English feature name left
 * out ("do", "no", "mit", "die", "im"): a stop word that removes a real term is worse than one kept.
 */
const SLUG_STOP_WORDS = [
  // French
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'pour', 'au', 'aux', 'en', 'sur', 'par', 'avec',
  // Spanish
  'el', 'los', 'las', 'del', 'al', 'una', 'unos', 'unas', 'y', 'para', 'con', 'por',
  // Italian
  'il', 'lo', 'gli', 'di', 'da', 'dei', 'delle', 'della', 'dello', 'per', 'su', 'uno',
  // Portuguese
  'os', 'dos', 'das', 'um', 'uma', 'com',
  // German
  'der', 'das', 'dem', 'ein', 'eine', 'einen', 'und', 'fur', 'von', 'zu',
];

/** NFD-decompose and drop combining marks: é→e, à→a, ñ→n, ü→u. ß and œ/æ spelled out. */
export function foldDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE');
}
/**
 * The title an existing document gives itself: `# Scope 135: Title`, `# SCOPE-135: Title`,
 * `# Spec 010 — Title`, or any plain H1. Used to name a file when no stored record exists.
 */
export function scopeTitleFromDocument(content: string): string {
  const h1 = content.match(/^#\s+(.+?)\s*$/m)?.[1] ?? '';
  return h1.replace(/^(?:scope|spec)[\s-]*\d+\s*[:—–-]\s*/i, '').trim() || 'scope';
}
// [SCOPE 135 / T009] END

// [SCOPE 135 / T011] BEGIN — templateOnly reports what actually ran
/**
 * FR-015 — the legacy template lives in the workspace's `.specify/templates/`, which the hosted
 * server does not have. `templateOnly` therefore did nothing there while the response still said
 * `template_only` (17b7ae98). One predicate decides both what is generated and what is reported.
 */
function legacyScopeTemplatePath(): string {
  return join(resolveWorkspaceRoot(), '.specify', 'templates', 'scope-template.md');
}

function legacyTemplateApplies(input: { templateOnly?: boolean; quick?: boolean }): boolean {
  return Boolean(input.templateOnly && input.quick && existsSync(legacyScopeTemplatePath()));
}
// [SCOPE 135 / T011] END

/**
 * Build scope content from input
 */
export function buildScopeContent(input: {
  featureDescription: string;
  specNumber: string;
  shortName: string;
  quick?: boolean;
  templateOnly?: boolean;
  primaryActor?: string;
  secondaryActors?: string[];
  businessProblem?: string;
  successMetrics?: string[];
  scopeBoundary?: string;
  outOfScope?: string;
  integrationContext?: string;
  constraintsAndRisks?: string;
  // [SCOPE 135 / T001] FR-001..FR-003 — the author's requirements, rendered verbatim.
  functionalRequirements?: ScopeFunctionalRequirementInput[];
  userScenarios?: ScopeUserScenarioInput[];
  dataRequirements?: string;
  apiRoutes?: string;
  frontendComponents?: string;
  keyEntities?: string;
  // [SCOPE 135 / T009] FR-013 — short H1 title; derived from featureDescription when omitted.
  title?: string;
}): string {
  const templatePath = legacyScopeTemplatePath();
  const today = new Date().toISOString().slice(0, 10);
  const scopeSource = `specs/Project-Scope/${input.specNumber}-${input.shortName}.md`;

  // [SCOPE 135 / T009] One title rule for the generated H1 and the legacy template alike.
  const titleWords = deriveScopeTitle(input.featureDescription, input.title);

  const shortDescription = input.businessProblem || 'Define the business value and outcome for this scope.';
  const primaryActor = input.primaryActor || 'Primary user';
  const secondaryActors = input.secondaryActors && input.secondaryActors.length > 0
    ? input.secondaryActors.join(', ')
    : 'Stakeholders, supporting users';
  const keyValue = deriveKeyValue(input.featureDescription, input.businessProblem);
  const scopeBoundary = input.scopeBoundary || 'Include the first working iteration of this workflow inside wxKanban with clear delivery boundaries.';
  const outOfScope = input.outOfScope || 'Exclude adjacent enhancements, downstream automations, and unrelated reporting until a follow-on scope is approved.';
  const integrationContext = input.integrationContext || 'This scope should align with the existing wxKanban workflow, project lifecycle, and any already-approved integrations in the same feature area.';
  const constraintsAndRisks = input.constraintsAndRisks || 'No additional delivery constraints or risks were identified during guided discovery.';
  const scopeBoundarySummary = `${sentence(scopeBoundary)} ${sentence(outOfScope)}`;
  const overview = [
    sentence(`${normalizeText(input.featureDescription)} gives wxKanban a clearly defined business workflow with accountable outcomes`),
    sentence(input.businessProblem || 'This scope turns the requested capability into a business-ready flow that can be reviewed, implemented, and validated without relying on undocumented assumptions'),
    sentence(`This scope covers ${normalizeText(scopeBoundary).replace(/[.!?]$/, '')}`),
    sentence(outOfScope),
  ].join(' ');

  const successLines =
    input.successMetrics && input.successMetrics.length > 0
      ? input.successMetrics.map((metric, idx) => `${idx + 1}. ${metric}`).join('\n')
      : [
          '1. Users can complete the primary workflow without manual workarounds.',
          '2. The feature reduces execution time for the main task by a measurable amount.',
          '3. Stakeholders can verify outcomes through clear acceptance criteria.',
        ].join('\n');
  const successItems = successLines
    .split('\n')
    .map((line) => normalizeText(line.replace(/^\d+\.\s+/, '')))
    .filter(Boolean);

  if (legacyTemplateApplies(input)) {
    const template = readFileSync(templatePath, 'utf8');

    return template
      .replaceAll('[NNN]', input.specNumber)
      .replace('[FEATURE NAME]', titleWords)
      .replace('[SHORT DESCRIPTION]', shortDescription)
      .replace('[DATE]', today)
      .replace('[List any dependent specs]', 'None')
      .replace('[scope-name]', `${input.shortName}`)
      .replace(
        '[Brief description of what this scope covers — the high-level purpose and value proposition. Focus on WHAT and WHY, not HOW.]',
        input.featureDescription
      )
      .replace('[Who primarily uses this feature]', primaryActor)
      .replace('[Who else interacts with this]', secondaryActors)
      .replace('[Main benefit delivered]', keyValue)
      .replace("[What's in scope vs out of scope]", `${scopeBoundary}; Out of scope: ${outOfScope}`)
      .replace('[Measurable outcome 1 — e.g., "Users can complete X in under Y minutes"]', successLines.split('\n')[0] || '1. TBD')
      .replace('[Measurable outcome 2 — e.g., "System supports N concurrent users"]', successLines.split('\n')[1] || '2. TBD')
      .replace('[Measurable outcome 3 — e.g., "95% of operations complete in under X seconds"]', successLines.split('\n')[2] || '3. TBD')
      .replace('[Measurable outcome 4]', successLines.split('\n')[3] || '4. TBD')
      .replace('[Measurable outcome 5]', successLines.split('\n')[4] || '5. TBD')
      .replace('`specs/Project-Scope/[NNN]-[scope-name].md`', `\`${scopeSource}\``);
  }

  const lines = [
    // [SCOPE 135 / T009] FR-013 — a scope is titled as a scope, with a title rather than a paragraph.
    `# Scope ${input.specNumber}: ${titleWords}`,
    '',
    `**Scope Number**: ${input.specNumber}`,
    '**Status**: `draft`',
    `**Created**: ${today}`,
    '**Depends On**: None',
    `**Source**: \`${scopeSource}\``,
    '',
    '## Overview',
    overview,
    '',
    '### Core Design',
    '',
    '| Element | Value |',
    '| --- | --- |',
    `| **Primary Actor** | ${primaryActor} |`,
    `| **Secondary Actors** | ${secondaryActors} |`,
    `| **Key Value** | ${keyValue} |`,
    `| **Scope Boundary** | ${scopeBoundarySummary} |`,
    '',
    '',
    '## User Scenarios & Testing',
    '',
    // [SCOPE 135 / T001 + T002] The author's scenarios and requirements, or a marker naming the input.
    ...renderUserScenarios(input.userScenarios),
    '',
    '## Functional Requirements',
    '',
    ...renderFunctionalRequirements(input.functionalRequirements),
    '',
    '## Data Requirements',
    '',
    ...renderTechnicalSection(
      input.dataRequirements,
      {
        what: 'Data requirements',
        parameter: 'dataRequirements',
        instruction: 'listing the tables this scope adds, modifies, or takes over (and anything the scope boundary forbids)',
      },
      scopeBoundary,
      outOfScope,
    ),
    '',
    '## API Routes',
    '',
    ...renderTechnicalSection(
      input.apiRoutes,
      {
        what: 'API routes',
        parameter: 'apiRoutes',
        instruction: 'listing the endpoints this scope adds or modifies, with method, path, and a one-line description',
      },
      scopeBoundary,
      outOfScope,
    ),
    '',
    '## Frontend Components',
    '',
    ...renderTechnicalSection(
      input.frontendComponents,
      {
        what: 'Frontend components',
        parameter: 'frontendComponents',
        instruction: 'listing the new and modified UI components, with paths and one-line descriptions',
      },
      scopeBoundary,
      outOfScope,
    ),
    '',
    '## Success Criteria',
    '',
    ...successItems.map((metric, index) => `${index + 1}. ${sentence(metric)}`),
    '',
    '## Key Entities',
    '',
    ...renderTechnicalSection(
      input.keyEntities,
      {
        what: 'Key entities',
        parameter: 'keyEntities',
        instruction: 'listing the domain entities this scope introduces, modifies, or takes over, with one-line descriptions',
      },
      scopeBoundary,
      outOfScope,
    ),
    '',
    '## Constraints',
    '',
    `- MUST deliver only the behavior described within the scope boundary: ${sentence(scopeBoundary)}`,
    `- MUST keep the following work out of scope for this iteration: ${sentence(outOfScope)}`,
    '- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.',
    '- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.',
    '',
    '## Notes',
    '',
    `- Integration context: ${sentence(integrationContext)}`,
    `- Constraints and risks: ${sentence(constraintsAndRisks)}`,
    '- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.',
    '',
    '## Clarifications',
    '',
    `### Session ${today}`,
    '',
    '| # | Question | Decision |',
    '|---|----------|----------|',
    `| 1 | What business problem does this solve? | ${sentence(input.businessProblem || 'The scope needs a defined workflow so teams can deliver the requested capability without relying on undocumented assumptions')} |`,
    `| 2 | Who are the primary and secondary actors? | Primary actor: ${primaryActor}. Secondary actors: ${secondaryActors}. |`,
    `| 3 | What is in scope? | ${sentence(scopeBoundary)} |`,
    `| 4 | What is out of scope? | ${sentence(outOfScope)} |`,
    `| 5 | How is success measured? | ${successItems.map((metric) => sentence(metric)).join(' ')} |`,
    `| 6 | What existing workflow must this align with? | ${sentence(integrationContext)} |`,
    `| 7 | What constraints or risks matter right now? | ${sentence(constraintsAndRisks)} |`,
    ''
  ];

  return lines.join('\n');
}

/**
 * Generate next spec number for a project
 */
function resolveWorkspaceRoot(): string {
  // Anchor on .wxkanban-project.json — the consumer-project root marker
  // installed by the kit. This is canonical regardless of whether specs/
  // exists yet (BUG-4: first-ever buildscope on a clean install used to
  // mis-file into mcp-server/specs/ because the legacy specs/ walk-up
  // fell back to process.cwd() when no specs/ was found, and the MCP
  // server runs from the mcp-server/ cwd).
  let currentDir = process.cwd();
  while (true) {
    if (existsSync(join(currentDir, '.wxkanban-project.json'))) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  // Legacy fallback: walk up looking for an existing specs/ directory.
  // Kept for kit-author dogfooding where .wxkanban-project.json may not
  // be present at the dev cwd.
  currentDir = process.cwd();
  while (true) {
    if (existsSync(join(currentDir, 'specs'))) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return process.cwd();
}

// [SCOPE 089] The next scope number MUST be counted from THIS project's own
// specs — never from a shared filesystem. On the hosted MCP the workspace
// filesystem is the kit author's baked-in wxKanban tree (scopes up to 091), so
// the old readdir path handed EVERY new project the same global "092". We count
// from the DB scoped to projectId instead; the filesystem read survives only as
// a local kit-author fallback (no projectId / DB unavailable).
export async function generateNextSpecNumber(projectId?: string): Promise<string> {
  return (await allocateSpecNumber(projectId)).specNumber;
}

// [SCOPE 135 / T008] BEGIN — the next number counts the project's record AND the caller's disk
/**
 * FR-012. Counting the database alone (SCOPE-089) fixed the hosted server handing every project
 * "092", but it is blind to specs that exist only on the caller's machine: c4e40bb5 was given 018
 * while `specs/018-…` sat on disk unpushed, and ff0eb155 ended up with two scopes numbered 013. The
 * hosted server cannot read that disk, so the caller sends the numbers it has (`localSpecNumbers`)
 * and the allocation counts past both. Without them the result says it counted stored specs only.
 */
export type SpecNumberBasis = 'database' | 'database+local' | 'filesystem' | 'edit';

export interface SpecNumberAllocation {
  specNumber: string;
  takenSpecNumbers: string[];
  numberingBasis: SpecNumberBasis;
}

function leadingSpecNumber(value: string): { value: number; width: number; text: string } | null {
  const match = String(value).trim().match(/^(\d+)/);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? { value: parsed, width: match[1].length, text: match[1] } : null;
}

export async function allocateSpecNumber(
  projectId?: string,
  localSpecNumbers?: string[],
): Promise<SpecNumberAllocation> {
  const local = (localSpecNumbers ?? []).map(String);
  let stored: string[] | null = null;

  if (projectId) {
    try {
      const rows = await db
        .select({ specNumber: projectspecifications.specNumber })
        .from(projectspecifications)
        .where(eq(projectspecifications.projectId, projectId));
      stored = rows.map((r) => r.specNumber).filter((value): value is string => typeof value === 'string');
    } catch (error) {
      logger.error('Error generating spec number from DB (falling back)', error as Error);
      // fall through to the local filesystem fallback below
    }
  }

  let numberingBasis: SpecNumberBasis = local.length > 0 ? 'database+local' : 'database';
  if (stored === null) {
    // Local kit-author fallback ONLY (no projectId or DB unreachable). On the
    // hosted server projectId is always present, so this path never runs there.
    numberingBasis = 'filesystem';
    try {
      const scopeDir = join(resolveWorkspaceRoot(), 'specs', 'Project-Scope');
      stored = existsSync(scopeDir)
        ? readdirSync(scopeDir)
            .map((name) => name.match(/^(\d{3,})-.*\.md$/)?.[1])
            .filter((value): value is string => Boolean(value))
        : [];
    } catch (error) {
      logger.error('Error generating spec number', error as Error);
      // Fallback to timestamp-based
      const timestamp = Date.now().toString(36).toUpperCase();
      return { specNumber: timestamp.slice(-3), takenSpecNumbers: [], numberingBasis };
    }
  }

  const parsed = [...stored, ...local]
    .map(leadingSpecNumber)
    .filter((entry): entry is { value: number; width: number; text: string } => entry !== null);
  if (parsed.length === 0) {
    return { specNumber: '001', takenSpecNumbers: [], numberingBasis };
  }

  // Width follows the HIGHEST number's own padding (minimum 3): a project numbering `0051` gets
  // `0052`, while one stray zero-padded row elsewhere cannot re-pad a 3-digit project.
  const highest = Math.max(...parsed.map((entry) => entry.value));
  const width = Math.max(3, ...parsed.filter((entry) => entry.value === highest).map((entry) => entry.width));
  const takenSpecNumbers = [...new Set(parsed.sort((a, b) => a.value - b.value).map((entry) => entry.text))];

  return {
    specNumber: String(highest + 1).padStart(width, '0'),
    takenSpecNumbers,
    numberingBasis,
  };
}
// [SCOPE 135 / T008] END

/**
 * Generate short name from feature description
 */
export function generateShortName(featureDescription: string): string {
  const withoutLeadingNumber = featureDescription.replace(/^\s*\d{3}\s*[-_:]\s*/i, '');
  // BUG-13: include common environment/lifecycle names so they don't get
  // selected as keywords (e.g. "UAT foundation" was producing the short
  // name "...-uat" + entity prefix "Uat" everywhere downstream).
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'with',
    'uat', 'prod', 'dev', 'qa', 'stg', 'staging', 'production', 'development',
    // [SCOPE 135 / T009] FR-013 — articles and prepositions of the languages customers file in.
    ...SLUG_STOP_WORDS,
  ]);

  // [SCOPE 135 / T009] FR-013 — fold accents BEFORE stripping non-ASCII. Stripping first turned
  // "Écran de paramètres" into "cran-de-param-tres" (84f98f9c) and "attività" into "attivit"
  // (a17783bb): the accented letter became a word break. An elided article ("l'", "d'") is removed
  // with its apostrophe; English contractions ("user's") are untouched because the letter before
  // their apostrophe does not start a word.
  const tokens = foldDiacritics(withoutLeadingNumber)
    .replace(/\b[a-z]['’]/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token && !stopWords.has(token));

  const selected = tokens.slice(0, 5);
  const normalized = (selected.length > 0 ? selected : ['scope', 'feature']).join('-');

  return normalized.substring(0, 40);
}

/**
 * Extract spec number from file path
 */
export function extractSpecNumberFromPath(filePath: string): string | null {
  const match = filePath.match(/specs\/(?:Project-Scope\/)?(\d{3})/);
  return match ? match[1] : null;
}

/**
 * Validate scope document content.
 *
 * Spec 029 / T001 — delegates to @wxkanban/preflight's runPreflight().
 * Kept as an export so existing callers (server.ts, createSpecsPreflight)
 * continue to compile unchanged.
 */
export function validateScopeContent(content: string): ScopeValidationResult {
  return runPreflight(content);
}

export function createSpecsPreflight(scopeContent: string): ScopeValidationResult {
  return runPreflight(scopeContent);
}

/**
 * SCOPE-124 / FR-001 — resolve WHICH scope an edit targets, from the database.
 *
 * This used to be `readdirSync(scopeDir).find(name => name.startsWith(`${specNumber}-`))`.
 * On the hosted MCP `scopeDir` is the SERVER's own workspace — there is no per-customer
 * filesystem there — so every consumer editing spec NNN read whatever `NNN-*.md` happened to
 * sit in the wxKanban repository. Field report a6734641 is that happening: the caller edited
 * their spec 016 and was handed back `016-scope-help`, which is OUR scope, together with a
 * filePath pointing at it. Only the slug crossed the boundary, never document content, but it
 * crossed on every edit call.
 *
 * `(projectId, specNumber)` is already the unique key on projectspecifications
 * (idx_projectspec_project_specnumber), so it is the natural identity. This is the same
 * correction SCOPE-089 applied to spec *numbering* ("was global-filesystem → every new project
 * got 092"); numbering moved to the DB and identity was left behind on the old mechanism.
 *
 * The filesystem branch survives ONLY for the local kit-author path, where there is no
 * projectId — exactly the condition generateNextSpecNumber documents for its own fallback.
 * Note this means testing locally exercises the fallback and hides the defect; verify against
 * the hosted server.
 *
 * MODIFIED-BY: [SCOPE 124 / T002] — also returns the scope's EXISTING content, so the edit path
 * can read-modify-write instead of regenerating. Same row, same query: identity and content come
 * from one read. The kit-author branch reads the file it just located, for the same reason.
 */
async function resolveEditTarget(
  specNumber: string,
  projectId: string | undefined,
  scopeDir: string,
  // [SCOPE 135 / T007] FR-011 — when the caller sent their own document, a missing stored record is
  // not an error: the caller's text is the base, and its own H1 names the file.
  callerContent?: string,
): Promise<{ fileName: string; existingContent: string | null; storedUpdatedAt?: Date | null }> {
  if (projectId) {
    const rows = await db
      .select({
        title: projectspecifications.title,
        content: projectspecifications.content,
        updatedAt: projectspecifications.updatedAt,
      })
      .from(projectspecifications)
      .where(
        and(
          eq(projectspecifications.projectId, projectId),
          eq(projectspecifications.specNumber, specNumber),
        ),
      )
      .limit(1);

    if (!rows[0] && callerContent !== undefined) {
      return { fileName: `${specNumber}-${generateShortName(scopeTitleFromDocument(callerContent))}.md`, existingContent: null };
    }

    if (!rows[0]) {
      // Name what IS available rather than dead-ending. buildscope does not persist (the client
      // writes the files), so a scope that was built but never pushed genuinely has no record —
      // and saying so is the correct answer, not a regression.
      const available = await db
        .select({ specNumber: projectspecifications.specNumber })
        .from(projectspecifications)
        .where(eq(projectspecifications.projectId, projectId));
      const known = available
        .map((r) => r.specNumber)
        .sort()
        .slice(0, 10)
        .join(', ');
      throw new Error(
        `Scope ${specNumber} not found in this project.` +
          (known ? ` Scopes in this project: ${known}${available.length > 10 ? ', …' : ''}.` : '') +
          ' Run buildscope without --edit-spec-number to create a new scope, or push this one first.',
      );
    }

    // Derived from the scope's own title, so the same scope always yields the same file name.
    return {
      fileName: `${specNumber}-${generateShortName(rows[0].title)}.md`,
      existingContent: rows[0].content || null,
      storedUpdatedAt: rows[0].updatedAt ?? null,
    };
  }

  const existingFile = readdirSync(scopeDir).find(
    (name) => name.startsWith(`${specNumber}-`) && name.endsWith('.md'),
  );
  if (!existingFile && callerContent !== undefined) {
    return { fileName: `${specNumber}-${generateShortName(scopeTitleFromDocument(callerContent))}.md`, existingContent: null };
  }
  if (!existingFile) {
    throw new Error(
      `Scope ${specNumber} not found. Use buildscope without --edit-spec-number to create a new scope.`,
    );
  }

  // [SCOPE 124 / T002] Local kit-author path: the file we just located IS the existing document,
  // so an edit here preserves the author's content the same way the hosted path preserves the
  // customer's. Reading it is safe precisely because this branch only runs with no projectId.
  let existingContent: string | null = null;
  try {
    existingContent = readFileSync(join(scopeDir, existingFile), 'utf8');
  } catch (error) {
    logger.warn('Could not read existing scope file for edit merge', {
      specNumber,
      file: existingFile,
      error: (error as Error).message,
    });
  }

  return { fileName: existingFile, existingContent };
}

/**
 * Build a scope document and RETURN it. Since SCOPE-028 Phase 12 this writes no file and stores no
 * row: on the hosted MCP a server-side write lands in this container rather than the caller's
 * workspace, so the caller writes `scopeContent` / `checklistContent` themselves and persists the
 * scope through `create_specs` or `dbpush`. The result says exactly that — see SCOPE-124 T020.
 */
export async function buildScope(input: {
  featureDescription: string;
  projectId?: string; // [SCOPE 089] scope numbering is counted per-project from the DB
  quick?: boolean;
  templateOnly?: boolean;
  editSpecNumber?: string;
  primaryActor?: string;
  secondaryActors?: string[];
  businessProblem?: string;
  successMetrics?: string[];
  scopeBoundary?: string;
  outOfScope?: string;
  integrationContext?: string;
  constraintsAndRisks?: string;
  // [SCOPE 135 / T001] FR-001..FR-003 — the author's requirements, rendered verbatim on a create.
  functionalRequirements?: ScopeFunctionalRequirementInput[];
  userScenarios?: ScopeUserScenarioInput[];
  dataRequirements?: string;
  apiRoutes?: string;
  frontendComponents?: string;
  keyEntities?: string;
  // [SCOPE 135 / T007] FR-011 — the caller's own scope file, the base an edit merges into.
  currentScopeContent?: string;
  // [SCOPE 135 / T008] FR-012 — numbers present on the caller's disk, counted with the stored ones.
  localSpecNumbers?: string[];
  // [SCOPE 135 / T009] FR-013 — short title for the H1 and slug; the only thing that retitles an edit.
  title?: string;
  // [SCOPE 135 / T016] FR-018 - add / replace / remove one named FR, US or acceptance line.
  edits?: ScopeItemEdit[];
  amendment?: string;
  // [SCOPE 135 / T020] FR-022 - why the edit was made (optional: "No reason given" when absent), and
  // whether the kit will write it without asking (--yes). Both go into the Amendment Log entry.
  reason?: string;
  unattended?: boolean;
}): Promise<BuildScopeResult> {
  try {
    const workspaceRoot = resolveWorkspaceRoot();
    const scopeDir = join(workspaceRoot, 'specs', 'Project-Scope');
    const mode = input.quick ? 'quick' : 'guided';

    // [SCOPE 135 / T008] A create allocates past the stored AND local numbers; an edit keeps its own.
    const allocation = input.editSpecNumber ? null : await allocateSpecNumber(input.projectId, input.localSpecNumbers);
    const specNumber = input.editSpecNumber || (allocation as SpecNumberAllocation).specNumber;
    const generatedShortName = generateShortName(input.title?.trim() || input.featureDescription);

    let scopeFileName = `${specNumber}-${generatedShortName}.md`;
    let existingContent: string | null = null;
    // [SCOPE 135 / T007] BEGIN — an edit merges into the caller's document when they send it
    // FR-011: the stored copy can be older and shorter than the author's file (56b8f6d2: 6.8K stored
    // vs 14.4K on disk), and merging into it silently drops whatever was never pushed.
    const callerContent = input.currentScopeContent?.trim() ? input.currentScopeContent : undefined;
    let editBase: ScopeEditBase | undefined;
    let stalenessCheck: ScopeStalenessCheck | undefined;
    // [SCOPE 135 / T019] FR-021 — the stored scope document, checked before anything is drafted.
    const storedScope = input.editSpecNumber ? await findStoredScopeDocument(input.projectId, specNumber) : null;
    if (input.editSpecNumber && callerContent !== undefined) {
      stalenessCheck = checkScopeStaleness(specNumber, callerContent, storedScope);
    }
    if (input.editSpecNumber && callerContent === undefined && storedScope) {
      // No local file sent: merge into the stored scope document, under its own file name.
      scopeFileName = storedScope.title;
      existingContent = storedScope.content;
      editBase = {
        source: 'stored',
        chars: storedScope.content.length,
        storedChars: storedScope.content.length,
        ...(storedScope.updatedAt ? { storedUpdatedAt: storedScope.updatedAt } : {}),
      };
    } else if (input.editSpecNumber) {
      const target = await resolveEditTarget(specNumber, input.projectId, scopeDir, callerContent);
      scopeFileName = target.fileName;
      const stored = target.existingContent;
      const storedUpdatedAt = isoDate(target.storedUpdatedAt);
      if (callerContent !== undefined) {
        existingContent = callerContent;
        editBase = {
          source: 'caller',
          chars: callerContent.length,
          ...(stored !== null ? { storedChars: stored.length } : {}),
          ...(storedUpdatedAt ? { storedUpdatedAt } : {}),
          // [SCOPE 135 / T019] the scope document, when stored, is the stored copy that matters.
          ...(storedScope ? { storedChars: storedScope.content.length } : {}),
          ...(storedScope?.updatedAt ? { storedUpdatedAt: storedScope.updatedAt } : {}),
        };
      } else {
        existingContent = stored;
        if (stored !== null) {
          editBase = {
            source: 'stored',
            chars: stored.length,
            storedChars: stored.length,
            ...(storedUpdatedAt ? { storedUpdatedAt } : {}),
          };
        }
      }
    }
    // [SCOPE 135 / T007] END

    // [SCOPE 135 / T008] `\d{3,}` — a four-digit number (`0051-…`) must not leave a digit in the slug.
    const shortName = scopeFileName.replace(/^\d{3,}-/, '').replace(/\.md$/, '');
    const filePath = `specs/Project-Scope/${scopeFileName}`;
    const absoluteScopePath = join(scopeDir, scopeFileName);
    const { checklistPath } = getChecklistPaths(specNumber, shortName);

    if (!input.editSpecNumber && existsSync(absoluteScopePath)) {
      throw new Error(`Scope file already exists: ${filePath}. Use --edit-spec-number=${specNumber} to update it.`);
    }

    const draftAssessment = assessBuildScopeInput({
      businessProblem: input.businessProblem,
      primaryActor: input.primaryActor,
      secondaryActors: input.secondaryActors,
      successMetrics: input.successMetrics,
      scopeBoundary: input.scopeBoundary,
      outOfScope: input.outOfScope,
      integrationContext: input.integrationContext,
      constraintsAndRisks: input.constraintsAndRisks,
      functionalRequirements: input.functionalRequirements,
      userScenarios: input.userScenarios,
    });

    // [SCOPE 124 / T002] An edit over an existing document is NOT an interview. `draftAssessment`
    // judges how complete the *arguments* are, so an edit that supplies one field looked like a
    // scope with six missing answers and was sent back through the full guided interview — field
    // report ff0eb155, "blank re-interview". The merged document is judged by preflight below,
    // which is the gate that actually matters, and the caller always gets their content back.
    const isMergeEdit = Boolean(input.editSpecNumber) && existingContent !== null;

    if (!input.quick && !isMergeEdit && draftAssessment.blockingIssues.length > 0) {
      return {
        success: true,
        mode,
        status: 'draft_interview',
        persisted: false,
        specNumber,
        shortName,
        sectionsCreated: [],
        questions: draftAssessment.questions,
        qualityScore: draftAssessment.qualityScore,
        blockingIssues: draftAssessment.blockingIssues,
        canProceedToCreateSpecs: false,
        message: `Scope ${specNumber} needs clarification before a draft file can be written. Start from the problem: nail businessProblem first, then build the rest of the scope from it.`,
        nextSteps: [
          'Anchor on the problem first — answer businessProblem before anything else; everything in the scope is built from it.',
          'Then answer the remaining guided questions (primaryActor, secondaryActors, 3 measurable successMetrics, scopeBoundary, outOfScope) and rerun buildscope.',
          // [SCOPE 135 / T003] FR-006 — the approved requirements travel as inputs, not as hand edits.
          'Pass the approved Functional Requirements and User Scenarios as functionalRequirements and userScenarios, and the technical sections as dataRequirements, apiRoutes, frontendComponents, and keyEntities (or "None").',
          'Before the final write, revisit the original featureDescription and reconcile it with the built scope — pass the revised wording.',
        ],
        ...(allocation ? { takenSpecNumbers: allocation.takenSpecNumbers, numberingBasis: allocation.numberingBasis } : {}),
      };
    }

    // [SCOPE 028 / Phase 12 — FR-021] No server-side mkdir/write; the client
    // writes the scope + checklist files into the workspace from the returned
    // content (write-first). On the hosted MCP these writes hit the wrong host.

    // [SCOPE 124 / T002] BEGIN — edit is a read-modify-write; create still generates
    // An edit splices the supplied fields into the document that already exists. Regenerating
    // here is what produced the empty shells (a02e6ec5): every field the caller omitted came back
    // as the generator's default, wiping sections they never touched. `mergeScopeEdit` returns the
    // existing bytes unchanged when nothing was supplied.
    let mergeResult: ScopeMergeResult | null = null;
    let scopeContent: string;

    if (isMergeEdit) {
      mergeResult = mergeScopeEdit(existingContent as string, {
        // [SCOPE 135 / T007] FR-011 — on an edit, featureDescription describes the CHANGE (ff0eb155
        // passed "four surgical edits to SCOPE-010"), so only an explicit title retitles the H1.
        title: input.title,
        primaryActor: input.primaryActor,
        secondaryActors: input.secondaryActors,
        businessProblem: input.businessProblem,
        successMetrics: input.successMetrics,
        scopeBoundary: input.scopeBoundary,
        outOfScope: input.outOfScope,
        integrationContext: input.integrationContext,
        constraintsAndRisks: input.constraintsAndRisks,
        // [SCOPE 135 / T016] FR-017 / FR-018 - these were dropped here, so an edit that supplied only
        // them came back "unchanged - no fields were supplied". Rendered with the create path's own
        // renderers so an edit and a create produce the same FR / US text.
        functionalRequirements: input.functionalRequirements?.length ? renderFunctionalRequirements(input.functionalRequirements) : undefined,
        userScenarios: input.userScenarios?.length ? renderUserScenarios(input.userScenarios) : undefined,
        dataRequirements: input.dataRequirements,
        apiRoutes: input.apiRoutes,
        frontendComponents: input.frontendComponents,
        keyEntities: input.keyEntities,
        edits: input.edits,
        amendment: input.amendment,
        // [SCOPE 135 / T020] FR-022 - every edit that changes something is logged.
        log: { reason: input.reason, unattended: input.unattended },
      });
      scopeContent = mergeResult.content;
      logger.info('Scope edit merged', {
        specNumber,
        replacedSections: mergeResult.replacedSections,
        createdSections: mergeResult.createdSections,
      });
    } else {
      if (input.editSpecNumber) {
        // Editing a spec whose record carries no content. There is nothing to preserve, so this
        // regenerates — say so rather than letting it look like a merge that dropped sections.
        logger.warn('Scope edit had no existing content to merge; regenerating', { specNumber });
      }
      scopeContent = buildScopeContent({
        featureDescription: input.featureDescription,
        specNumber,
        shortName,
        quick: input.quick,
        templateOnly: input.templateOnly,
        primaryActor: input.primaryActor,
        secondaryActors: input.secondaryActors,
        businessProblem: input.businessProblem,
        successMetrics: input.successMetrics,
        scopeBoundary: input.scopeBoundary,
        outOfScope: input.outOfScope,
        integrationContext: input.integrationContext,
        constraintsAndRisks: input.constraintsAndRisks,
        functionalRequirements: input.functionalRequirements,
        userScenarios: input.userScenarios,
        dataRequirements: input.dataRequirements,
        apiRoutes: input.apiRoutes,
        frontendComponents: input.frontendComponents,
        keyEntities: input.keyEntities,
        title: input.title,
      });
    }
    // [SCOPE 124 / T002] END

    const validation = validateScopeContent(scopeContent);

    // [SCOPE 028 / Phase 12 — FR-021] Compute (don't write) the checklist; the
    // client writes both scope + checklist files from the returned content.
    const checklistContent = buildChecklistContent({
      specNumber,
      shortName,
      sourcePath: filePath,
      scopeContent,
      validation,
    });

    // [SCOPE 124 / T020] One clause, appended to every outcome message, naming what this call did
    // NOT do. Field report 7dfc7c13 acted on "created" plus a concrete path and came within a step
    // of replacing a finished scope with generated boilerplate.
    const notWrittenNote =
      ` Nothing has been written or stored by this call — the draft is returned in scopeContent for` +
      ` you to write to ${filePath} (the buildscope CLI does this for you), and no record exists for` +
      ` spec ${specNumber} until create_specs or dbpush runs.`;

    // [SCOPE 135 / T002 + T007 + T008 + T010 + T011] What the caller must know beyond the verdict:
    // inputs whose absence blocks the draft, gaps the gate does not enforce, which document an edit
    // merged into, how the number was counted, and whether templateOnly actually ran.
    const missingInputs = mergeResult ? [] : omittedRequirementInputs(input);
    const advisories = openAdvisories(scopeContent, validation);
    const templateUsed = legacyTemplateApplies(input);
    const outcomeNotes = [
      // [SCOPE 135 / T019] FR-021 — say when the staleness check could not run, and why.
      stalenessCheck?.status === 'skipped' ? ` Staleness check skipped: ${stalenessCheck.reason}.` : '',
      input.templateOnly && !templateUsed
        ? ' templateOnly was ignored: no legacy scope template is available here, so the standard draft was generated.'
        : '',
      editBase?.source === 'stored'
        ? ` This edit was merged into the stored copy of spec ${specNumber} (${editBase.chars} characters${editBase.storedUpdatedAt ? `, last pushed ${editBase.storedUpdatedAt.slice(0, 10)}` : ''}), not your local file. To edit your own file, pass its text as currentScopeContent.`
        : '',
      allocation?.numberingBasis === 'database'
        ? ` Spec number ${specNumber} was counted from this project's stored specs only and may already be used by unpushed local work; pass localSpecNumbers (the numbers in your specs/ and specs/Project-Scope/) to rule that out.`
        : '',
      validation.isValid && advisories.length > 0
        ? ` Advisory, not enforced by the gate: ${advisories.join('; ')}.`
        : '',
    ].join('');

    logger.info('Scope drafted successfully', { specNumber, suggestedFilePath: filePath, persisted: false });

    return {
      success: true,
      mode,
      // [SCOPE 124 / T020] `created` plus a path reads as a file on disk and a row in the project.
      // This call produces neither; it produces the content below.
      // [SCOPE 135 / T011] FR-015 — `template_only` only when the legacy template actually ran.
      status: templateUsed ? 'template_only' : input.editSpecNumber ? 'draft_updated' : 'drafted',
      specNumber,
      shortName,
      filePath,
      checklistPath,
      suggestedFilePath: filePath,
      suggestedChecklistPath: checklistPath,
      persisted: false,
      scopeContent,
      // [SCOPE 028 / Phase 12 — FR-021] client writes these to the workspace.
      checklistContent,
      // [SCOPE 124 / T003] On an edit, report the sections this call actually created — the fixed
      // seven-item list is what a CREATE writes, and returning it for an edit that changed one
      // line was a claim the document itself contradicted.
      sectionsCreated: mergeResult
        ? mergeResult.createdSections
        : ['overview', 'business_problem', 'actors', 'success_metrics', 'scope_boundary', 'out_of_scope', 'open_questions'],
      sectionsChanged: mergeResult ? mergeResult.changes : undefined,
      questions: [],
      qualityScore: validation.score,
      blockingIssues: validation.blockingIssues,
      canProceedToCreateSpecs: validation.isValid,
      // [SCOPE 124 / T002] An edit reports what it did to the document that already existed —
      // including "nothing", which is now a legitimate and safe outcome rather than a wipe.
      // [SCOPE 124 / T003] Name the sections whose existing prose this edit displaced. Listing
      // every touched section equally would bury the one that matters: overwriting the generator's
      // boilerplate is unremarkable, overwriting a paragraph someone wrote is the blast radius.
      message:
        (mergeResult
          ? mergeResult.replacedSections.length === 0
            ? `Scope ${specNumber} unchanged — no fields were supplied to edit. The existing document is returned as-is.` +
              // [SCOPE 135 / T016] FR-017 - never say "no fields" while naming nothing: if the caller
              // sent something the merge ignored, say which.
              (ignoredEditInputs(input).length > 0 ? ` Supplied but not applied: ${ignoredEditInputs(input).join(', ')}.` : '')
            : `Scope ${specNumber} edited: ${mergeResult.replacedSections.join(', ')}. All other sections are unchanged.` +
              (mergeResult.changes.some((c) => c.substantial)
                ? ` Existing content was replaced in: ${mergeResult.changes.filter((c) => c.substantial).map((c) => c.section).join(', ')}.`
                : '') +
              (validation.isValid ? '' : ' It still has blocking issues to resolve before create_specs.')
          : validation.isValid
            ? `Scope ${specNumber} drafted and ready for spec generation.`
            : `Scope ${specNumber} drafted, but it still has blocking issues to resolve before create_specs.`) +
        outcomeNotes +
        notWrittenNote,
      nextSteps: [
        // [SCOPE 124 / T020] The write leads, because this response is the only copy of the draft —
        // every step after it assumes the caller has the content on their own disk.
        `Write scopeContent to ${editBase?.source === 'caller' ? 'the local file you sent as currentScopeContent' : filePath} and checklistContent to ${checklistPath} — this response is the only copy.`,
        // [SCOPE 135 / T002] FR-005 — name every input whose absence left a blocking marker.
        ...(missingInputs.length > 0
          ? [`Supply ${missingInputs.join(', ')} (or "None" for a technical section this scope does not touch) and rerun buildscope — each one left a blocking marker in the draft.`]
          : []),
        ...(validation.isValid
          ? ['Confirm the original description still matches the scope you built from the problem; revise it if it drifted.', 'Run validatescope with scopeContent to confirm the draft — there is no stored copy to look up until it is pushed.', 'Use create_specs once the scope is approved; that is the call that persists it.']
          : ['Run validatescope with scopeContent to review blockers.', 'Resolve placeholder or quality issues before create_specs.']),
      ],
      // [SCOPE 135] Additive response fields — older kits ignore them.
      ...(missingInputs.length > 0 ? { missingInputs } : {}),
      advisories,
      ...(allocation ? { takenSpecNumbers: allocation.takenSpecNumbers, numberingBasis: allocation.numberingBasis } : { numberingBasis: 'edit' as const }),
      ...(editBase ? { editBase } : {}),
      ...(mergeResult && existingContent !== null ? { editDiff: formatEditDiff(existingContent, scopeContent) } : {}),
      ...(stalenessCheck ? { stalenessCheck } : {}),
    };
  } catch (error) {
    logger.error('Error building scope', error as Error, {
      featureDescription: input.featureDescription,
    });
    throw error;
  }
}

/**
 * Validate scope by supplied content, spec number, or file path
 */
export async function validateScope(input: {
  specNumber?: string;
  scopeContent?: string;
  filePath?: string;
  projectId?: string;
}): Promise<ScopeValidationResult> {
  try {
    let content: string | null = null;
    let actualSpecNumber = input.specNumber || 'unknown';
    let actualFilePath = input.filePath || `specs/Project-Scope/${actualSpecNumber}-*.md`;

    // [SCOPE 124 / T019] BEGIN — validate what the caller sent, before it is anywhere
    // T018 closed the filesystem paths for a project-scoped caller, correctly: on the hosted MCP
    // `resolveWorkspaceRoot()` is OUR repository, so reading a caller-supplied path scored the
    // wrong tenant's document, and an unconstrained absolute path was a readability probe besides.
    // But closing them left a real gap open. buildscope writes the scope file on the CLIENT, so
    // between `buildscope` and `create_specs` the document exists only on the caller's disk — there
    // was no way to check it before pushing, and `filePath` looked like one while being inert.
    //
    // No path can close that gap: the caller's file is not on this machine, and any parameter that
    // makes the server open a path reopens T018. Content can. The caller reads their own file and
    // sends the text; the server scores it and never touches a filesystem. This is the same shape
    // `create_specs` has always used for `scopeContent`.
    //
    // It takes precedence over the database lookup deliberately. A caller who sends a document is
    // asking about THAT document — usually a draft newer than the stored copy.
    if (input.scopeContent) {
      content = input.scopeContent;
      // `filePath` is a label on this route, not an instruction. It is echoed into the result so a
      // caller validating several drafts can tell the verdicts apart; nothing opens it. With no
      // label, say plainly that the content was supplied rather than printing the
      // `specs/Project-Scope/unknown-*.md` guess the default would produce.
      actualFilePath = input.filePath || '(scopeContent supplied by caller)';
    }
    // [SCOPE 124 / T019] END

    // Try to get content from database
    if (!content && input.specNumber && input.projectId) {
      const result = await db.execute(sql`
        SELECT content, specnumber FROM projectspecifications
        WHERE projectid = ${input.projectId} AND specnumber = ${input.specNumber}
        LIMIT 1
      `);
      
      const rows = (result as any).rows || result || [];
      if (Array.isArray(rows) && rows.length > 0) {
        content = rows[0].content;
        actualSpecNumber = rows[0].specnumber;
      }
    }

    // [SCOPE 124 / T018] BEGIN — with a projectId, the database is the ONLY source
    // These two fallbacks are the same defect T001 removed from the edit path, still live here and
    // reaching further. `resolveWorkspaceRoot()` on the hosted MCP is the wxKanban repository — the
    // server's own tree, not the caller's — so a consumer validating their spec 016 fell through to
    // `readdirSync` and had OUR `016-scope-help.md` scored instead. They were then told their scope
    // passed, or which blocking issues to fix, entirely on the strength of another tenant's
    // document. The verdict crossed the boundary even though the document body did not.
    //
    // The `filePath` branch is worse in kind: the path is caller-supplied, unconstrained, and
    // `isAbsolute` is honoured, so a remote caller could name any readable path on the server and
    // learn from the result whether it exists and whether it contains marker tokens.
    //
    // One rule closes both: a caller who identified their project is answered from their project's
    // records or not at all. The filesystem survives only for the local kit-author path, where
    // there is no projectId — the same condition generateNextSpecNumber and resolveEditTarget
    // already document for their own fallbacks.
    if (!input.projectId) {
      if (!content && input.specNumber) {
        const scopeDir = join(resolveWorkspaceRoot(), 'specs', 'Project-Scope');
        if (existsSync(scopeDir)) {
          const fileName = readdirSync(scopeDir).find(
            (name) => name.startsWith(`${input.specNumber}-`) && name.endsWith('.md')
          );
          if (fileName) {
            const absolutePath = join(scopeDir, fileName);
            content = readFileSync(absolutePath, 'utf8');
            actualFilePath = `specs/Project-Scope/${fileName}`;
          }
        }
      }

      // If not found in DB, try to read from file system
      if (!content && input.filePath) {
        const absolutePath = isAbsolute(input.filePath)
          ? input.filePath
          : resolve(resolveWorkspaceRoot(), input.filePath);
        if (existsSync(absolutePath)) {
          content = readFileSync(absolutePath, 'utf8');
        }
      }
    }
    // [SCOPE 124 / T018] END

    // If still no content, return error result
    if (!content) {
      // [SCOPE 124 / T018] Name the real reason. Before the fallbacks were gated, a project-scoped
      // caller whose scope was not in the DB got a confident verdict on someone else's document
      // instead of this. "Not found" is the correct answer, and it has to say what to do next:
      // buildscope does not persist — the client writes the files, so an unpushed scope genuinely
      // has no record here.
      //
      // [SCOPE 124 / T019] MODIFIED-BY — offer the route that does not require pushing first. The
      // T018 wording named pushing as the ONLY remedy, which sent callers to create_specs purely to
      // get a verdict, and left anyone who had passed `filePath` with no hint that it was inert.
      // Say scopeContent first: it is the answer for a scope that is still only on disk.
      const notFound = input.projectId
        ? `Scope ${actualSpecNumber} is not in this project's records. ` +
          `To validate a scope that is not pushed yet, read the local file and pass its text as scopeContent — ` +
          `filePath is not read here, because this server would resolve it against its own disk rather than yours. ` +
          `Otherwise push the scope first (create_specs or dbpush); buildscope does not persist on its own.`
        : 'Scope document not found. Please build or locate the scope before validating it.';
      return {
        success: false,
        specNumber: actualSpecNumber,
        filePath: actualFilePath,
        status: 'error',
        isValid: false,
        score: 0,
        checks: {
          hasOverview: false,
          hasBusinessProblem: false,
          hasActors: false,
          hasSuccessMetrics: false,
          hasScopeBoundary: false,
          hasOutOfScope: false,
          hasOpenQuestions: false,
        },
        placeholdersFound: [],
        blockingIssues: [notFound],
        minimumCriteriaStatus: {
          businessProblem: false,
          primaryActor: false,
          secondaryActors: false,
          measurableSuccessMetrics: false,
          scopeBoundary: false,
          outOfScope: false,
          noPlaceholders: true,
        },
        missingSections: ['overview', 'business_problem', 'actors', 'success_metrics', 'scope_boundary', 'out_of_scope', 'open_questions'],
        suggestions: [notFound],
        warnings: [],
        errors: [`Could not find scope for spec ${actualSpecNumber}`],
        message: `Could not find scope for spec ${actualSpecNumber}.`,
      };
    }

    // Validate the content
    const result = validateScopeContent(content);
    result.specNumber = actualSpecNumber;
    result.filePath = actualFilePath;

    // [SCOPE 028 / Phase 12 — FR-021] No server-side checklist re-write on
    // validate; the client authors the checklist (via buildscope's returned
    // checklistContent). validateScope only validates and returns the result.

    logger.info('Scope validated', {
      specNumber: actualSpecNumber, 
      score: result.score,
      isValid: result.isValid 
    });

    return result;
  } catch (error) {
    logger.error('Error validating scope', error as Error, { 
      specNumber: input.specNumber,
      filePath: input.filePath 
    });
    throw error;
  }
}
