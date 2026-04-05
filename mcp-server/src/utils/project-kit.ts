/**
 * Project Kit Utilities
 * 
 * Handles kit status checking, download URL generation, 
 * kit regeneration, and API token management for Spec 011.
 */

import { db } from '../db/connection.js';
import { eq, sql } from 'drizzle-orm';
import logger from './logger.js';
import { randomUUID, createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';

// Kit status types
export type KitStatus = 'not_generated' | 'generating' | 'ready' | 'failed';

// Kit info interface
export interface KitInfo {
  status: KitStatus;
  primaryAI: string | null;
  kitVersion: string | null;
  downloadUrl: string | null;
  generatedAt: string | null;
  downloadCount: number | null;
}

// API Token interface
export interface ApiToken {
  id: string;
  tokenPrefix: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Get kit status for a project
 */
export async function getKitStatus(projectId: string): Promise<KitInfo> {
  try {
    // Return placeholder kit status - schema still in development (Spec 011)
    // In production, this will query the projectkits table
    logger.info('Getting kit status', { projectId });
    
    return {
      status: 'not_generated',
      primaryAI: null,
      kitVersion: null,
      downloadUrl: null,
      generatedAt: null,
      downloadCount: null,
    };
  } catch (error) {
    logger.error('Error getting kit status', error as Error, { projectId });
    throw error;
  }
}

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
export async function createApiToken(
  userId: string, 
  companyId: string, 
  label?: string
): Promise<{ token: string; record: any }> {
  try {
    const token = generateApiToken();
    const tokenHash = hashToken(token);
    const tokenPrefix = getTokenPrefix(token);
    const tokenId = randomUUID();
    const now = new Date();
    
    // Insert into apitokens table using raw SQL
    await db.execute(sql`
      INSERT INTO apitokens (id, userid, companyid, tokenprefix, tokenhash, label, revokedat, createdat)
      VALUES (${tokenId}, ${userId}, ${companyId}, ${tokenPrefix}, ${tokenHash}, ${label || null}, null, ${now})
    `);

    const record = {
      id: tokenId,
      userid: userId,
      companyid: companyId,
      tokenprefix: tokenPrefix,
      tokenhash: tokenHash,
      label: label || null,
      revokedat: null,
      createdat: now,
    };

    logger.info('API token created', { userId, tokenPrefix, label });
    
    return { token, record };
  } catch (error) {
    logger.error('Error creating API token', error as Error, { userId });
    throw error;
  }
}

/**
 * List API tokens for user
 */
export async function listApiTokens(userId: string): Promise<ApiToken[]> {
  try {
    // Use raw SQL to avoid schema type issues
    const result = await db.execute(sql`
      SELECT id, tokenprefix, label, createdat, revokedat 
      FROM apitokens 
      WHERE userid = ${userId} AND revokedat IS NULL
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
    const result = await db.execute(sql`
      UPDATE apitokens 
      SET revokedat = ${new Date()}
      WHERE id = ${tokenId} AND userid = ${userId}
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
    
    // Use raw SQL to avoid schema type issues
    const result = await db.execute(sql`
      SELECT * FROM apitokens 
      WHERE tokenhash = ${tokenHash} AND revokedat IS NULL
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
 * Start kit regeneration
 */
export async function regenerateKit(projectId: string): Promise<{ success: boolean; message: string }> {
  try {
    // Update kit status to generating
    await db.update((db as any).projectkits)
      .set({ 
        status: 'generating',
        updatedat: new Date(),
      })
      .where(eq((db as any).projectkits.projectid, projectId));

    logger.info('Kit regeneration started', { projectId });
    
    // In a real implementation, this would trigger an async job
    // For now, we return success and the job would complete asynchronously
    
    return {
      success: true,
      message: 'Kit regeneration started. Check status with kitstatus command.',
    };
  } catch (error) {
    logger.error('Error regenerating kit', error as Error, { projectId });
    throw error;
  }
}

/**
 * Import existing project
 */
export async function importProject(input: {
  name: string;
  description?: string;
  primaryAI: string;
  localDirectoryPath?: string;
  generateKit: boolean;
  phaseAssignments?: Record<string, string>;
  createdById: string;
  companyId: string;
}): Promise<any> {
  try {
    // This is a placeholder - in real implementation, this would:
    // 1. Create project record
    // 2. Create phase assignments
    // 3. Generate kit with importMode=true (no ProjectOverview.md)
    // 4. Return project + kit info
    
    logger.info('Importing project', { name: input.name, primaryAI: input.primaryAI });
    
    // Placeholder return
    return {
      id: randomUUID(),
      name: input.name,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error importing project', error as Error, { name: input.name });
    throw error;
  }
}

// ============================================================================
// Scope Management Functions (Spec 014)
// ============================================================================

/**
 * Scope validation result
 */
export interface ScopeValidationResult {
  success: boolean;
  specNumber: string;
  filePath: string;
  status: 'valid' | 'invalid' | 'error';
  isValid: boolean;
  score: number;
  checks: {
    hasOverview: boolean;
    hasBusinessProblem: boolean;
    hasActors: boolean;
    hasSuccessMetrics: boolean;
    hasScopeBoundary: boolean;
    hasOutOfScope: boolean;
    hasOpenQuestions: boolean;
  };
  placeholdersFound: string[];
  blockingIssues: string[];
  minimumCriteriaStatus: {
    businessProblem: boolean;
    primaryActor: boolean;
    secondaryActors: boolean;
    measurableSuccessMetrics: boolean;
    scopeBoundary: boolean;
    outOfScope: boolean;
    noPlaceholders: boolean;
  };
  missingSections: string[];
  suggestions: string[];
  warnings: string[];
  errors: string[];
  message: string;
}

export interface BuildScopeQuestion {
  field: string;
  question: string;
}

export interface BuildScopeResult {
  success: boolean;
  mode: 'guided' | 'quick';
  status: 'draft_interview' | 'ready_for_write' | 'created' | 'updated' | 'template_only';
  specNumber: string;
  shortName: string;
  filePath?: string;
  checklistPath?: string;
  scopeContent?: string;
  sectionsCreated: string[];
  questions: BuildScopeQuestion[];
  qualityScore: number;
  blockingIssues: string[];
  canProceedToCreateSpecs: boolean;
  message: string;
  nextSteps: string[];
}

const PLACEHOLDER_MARKERS = ['TODO', 'TBD', 'NEEDS CLARIFICATION', 'placeholder'] as const;

const DEFAULT_SCOPE_CONTENT = {
  businessProblem: [
    'Define the business value and outcome for this scope.',
    'TODO: Define the business problem this feature solves',
  ],
  primaryActor: [
    'Primary user',
    'TODO: Define primary actor',
  ],
  secondaryActors: [
    'Stakeholders, supporting users',
    'TODO: Define secondary actors',
  ],
  scopeBoundary: [
    'In scope and out-of-scope details to be refined during scope review.',
    'TODO: Define what is in scope for this feature',
  ],
  outOfScope: [
    'TODO: Define what is explicitly out of scope',
  ],
  integrationContext: [
    'Existing systems, workflows, and documents that this scope must align with.',
  ],
  constraintsAndRisks: [
    'Known delivery constraints, assumptions, and risks that should be reviewed before implementation.',
  ],
};

function checkbox(checked: boolean): string {
  return checked ? 'x' : ' ';
}

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

function sentence(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function pascalCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join('');
}

function deriveKeyValue(featureDescription: string, businessProblem?: string): string {
  const normalizedProblem = normalizeText(businessProblem);
  if (normalizedProblem.length >= 20) {
    return sentence(normalizedProblem);
  }

  const normalizedFeature = normalizeText(featureDescription).toLowerCase();
  return sentence(`Deliver a clearer ${normalizedFeature || 'workflow'} process with measurable outcomes`);
}

function buildChecklistContent(input: {
  specNumber: string;
  shortName: string;
  sourcePath: string;
  scopeContent: string;
  validation: ScopeValidationResult;
}): string {
  const scenarioCount = countMatches(input.scopeContent, /^###\s+US\d+\b/gim);
  const functionalRequirementCount = countMatches(input.scopeContent, /^###\s+FR-\d{3}\b/gim);
  const acceptanceCriteriaCount = countMatches(input.scopeContent, /^\*\*Acceptance Criteria\*\*:/gim);
  const constraintsPresent = /##\s*Constraints(?:\s*&\s*Risks|\s*&\s*Notes)?\b/i.test(input.scopeContent);
  const integrationContextPresent = /##\s*Integration\s*Context\b/i.test(input.scopeContent) || /Integration context:/i.test(input.scopeContent);
  const keyValuePresent = /\|\s*\*\*Key Value\*\*\s*\|\s*.+\|/i.test(input.scopeContent);

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
    '',
    '## Specification Quality',
    '',
    `- [${checkbox(input.validation.checks.hasOverview)}] Overview clearly states WHAT and WHY (not HOW)`,
    `- [${checkbox(scenarioCount >= 3)}] User scenarios cover primary, secondary, and edge cases`,
    `- [${checkbox(functionalRequirementCount >= 3)}] Functional requirements are numbered (FR-001, FR-002...)`,
    `- [${checkbox(acceptanceCriteriaCount >= Math.min(3, functionalRequirementCount || 3))}] Each FR has clear acceptance criteria`,
    `- [${checkbox(input.validation.minimumCriteriaStatus.measurableSuccessMetrics)}] Success criteria are measurable and technology-agnostic`,
    `- [${checkbox(input.validation.minimumCriteriaStatus.scopeBoundary && input.validation.minimumCriteriaStatus.outOfScope)}] Scope boundaries are clearly defined`,
    `- [${checkbox(input.validation.minimumCriteriaStatus.noPlaceholders)}] No implementation placeholders remain in required sections`,
    '',
    '## Completeness',
    '',
    `- [${checkbox(input.validation.minimumCriteriaStatus.primaryActor)}] Primary actor identified`,
    `- [${checkbox(keyValuePresent)}] Key value proposition stated`,
    `- [${checkbox(scenarioCount >= 3)}] At least 3 user scenarios defined`,
    `- [${checkbox(functionalRequirementCount >= 3)}] At least 3 functional requirements defined`,
    `- [${checkbox(input.validation.minimumCriteriaStatus.measurableSuccessMetrics)}] At least 3 success criteria defined`,
    `- [${checkbox(constraintsPresent)}] Constraints documented`,
    `- [${checkbox(integrationContextPresent)}] Integration context documented`,
    '',
    '## Readiness for Pipeline',
    '',
    `- [${checkbox(input.validation.minimumCriteriaStatus.noPlaceholders)}] No [NEEDS CLARIFICATION], TODO, or TBD markers remain in required sections`,
    `- [${checkbox(input.validation.isValid)}] Scope clears the validatescope quality gate`,
    `- [${checkbox(input.validation.minimumCriteriaStatus.businessProblem && input.validation.minimumCriteriaStatus.primaryActor && input.validation.minimumCriteriaStatus.secondaryActors)}] Business context and actors are implementation-ready`,
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

function updateScopeChecklist(input: {
  specNumber: string;
  shortName: string;
  sourcePath: string;
  scopeContent: string;
  validation: ScopeValidationResult;
}): string {
  const { checklistDir, checklistPath, absoluteChecklistPath } = getChecklistPaths(input.specNumber, input.shortName);
  mkdirSync(checklistDir, { recursive: true });
  writeFileSync(
    absoluteChecklistPath,
    buildChecklistContent({
      specNumber: input.specNumber,
      shortName: input.shortName,
      sourcePath: input.sourcePath,
      scopeContent: input.scopeContent,
      validation: input.validation,
    }),
    'utf8'
  );
  return checklistPath;
}

function normalizeText(value: string | undefined): string {
  return (value || '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/^[\-*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesPlaceholder(value: string): string[] {
  const normalized = normalizeText(value);
  return PLACEHOLDER_MARKERS.filter((marker) =>
    new RegExp(`\\b${marker.replace(/\s+/g, '\\s+')}\\b`, 'i').test(normalized)
  );
}

function matchesDefaultValue(value: string | undefined, defaults: string[]): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return defaults.some((candidate) => normalizeText(candidate).toLowerCase() === normalized);
}

function isMeaningfulText(value: string | undefined, defaults: string[], minimumLength = 20): boolean {
  const normalized = normalizeText(value);

  if (!normalized || normalized.length < minimumLength) {
    return false;
  }

  if (matchesPlaceholder(normalized).length > 0) {
    return false;
  }

  if (matchesDefaultValue(normalized, defaults)) {
    return false;
  }

  return true;
}

function isMeasurableMetric(metric: string): boolean {
  const normalized = normalizeText(metric);

  if (!normalized || normalized.length < 12) {
    return false;
  }

  if (matchesPlaceholder(normalized).length > 0) {
    return false;
  }

  return /\d|%/.test(normalized) || /\b(under|within|less than|more than|at least|at most|per|seconds?|minutes?|hours?|days?|weeks?|months?|ms|concurrent|users?|requests?|records?|tasks?|tickets?|errors?|uptime|availability|latency|throughput|rate)\b/i.test(normalized);
}

function extractSectionContent(content: string, headingPattern: RegExp): string {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => headingPattern.test(line.trim()));

  if (startIndex === -1) {
    return '';
  }

  const sectionLines: string[] = [];
  for (let idx = startIndex + 1; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (/^##\s+/.test(trimmed)) {
      break;
    }
    sectionLines.push(lines[idx]);
  }

  return sectionLines.join('\n').trim();
}

function extractActorValue(sectionContent: string, label: 'Primary' | 'Secondary'): string {
  const match = sectionContent.match(new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${label}\\s*:\\s*(.+)$`, 'im'));
  return match ? normalizeText(match[1]) : '';
}

function extractCoreDesignValue(content: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`\\|\\s*\\*\\*${escapedLabel}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, 'i'));
  return match ? normalizeText(match[1]) : '';
}

function extractMetricLines(sectionContent: string): string[] {
  return sectionContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => normalizeText(line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')))
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function assessBuildScopeInput(input: {
  businessProblem?: string;
  primaryActor?: string;
  secondaryActors?: string[];
  successMetrics?: string[];
  scopeBoundary?: string;
  outOfScope?: string;
  integrationContext?: string;
  constraintsAndRisks?: string;
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
}): string {
  const templatePath = join(resolveWorkspaceRoot(), '.specify', 'templates', 'scope-template.md');
  const today = new Date().toISOString().slice(0, 10);
  const scopeSource = `specs/Project-Scope/${input.specNumber}-${input.shortName}.md`;

  const titleWords = input.featureDescription
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');

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
  const featureLabel = titleCase(input.shortName.replace(/-/g, ' '));
  const componentBase = pascalCase(featureLabel);
  const featureWords = input.shortName.split('-').filter(Boolean);
  const resourceBase = featureWords[featureWords.length - 1] || 'scope';
  const entityRoot = featureWords.join('') || 'scope';
  const primaryTable = `company${resourceBase.endsWith('s') ? resourceBase : `${resourceBase}s`}`;
  const eventTable = `${entityRoot}events`;
  const historyTable = `${entityRoot}history`;
  const apiBasePath = `/api/${input.shortName}`;
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

  if (input.templateOnly && input.quick && existsSync(templatePath)) {
    const template = readFileSync(templatePath, 'utf8');

    return template
      .replaceAll('[NNN]', input.specNumber)
      .replace('[FEATURE NAME]', titleWords || input.featureDescription)
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
    `# Spec ${input.specNumber}: ${input.featureDescription}`,
    '',
    `**Spec Number**: ${input.specNumber}`,
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
    `### US1 — ${featureLabel} primary workflow`,
    '',
    `**Actor**: ${primaryActor}`,
    '',
    '**Scenario**:',
    `1. ${primaryActor} initiates the primary ${normalizeText(input.featureDescription).toLowerCase()} workflow inside wxKanban.`,
    `2. ${primaryActor} completes the in-scope steps defined for the first iteration and confirms the expected business rules.`,
    '3. The system records the result and exposes the updated state to the affected stakeholders.',
    '',
    `**Expected outcome**: ${sentence(successItems[0] || 'The primary workflow completes without manual workaround')}`,
    '',
    `### US2 — ${featureLabel} review and coordination flow`,
    '',
    `**Actor**: ${secondaryActors}`,
    '',
    '**Scenario**:',
    '1. A secondary actor reviews the result produced by the primary workflow.',
    '2. The actor confirms that the information needed for the next downstream step is available and aligned with the agreed scope boundary.',
    '3. The workflow remains visible and understandable across the affected teams.',
    '',
    `**Expected outcome**: ${sentence(successItems[1] || 'Downstream reviewers can act without requesting missing context')}`,
    '',
    `### US3 — ${featureLabel} exception handling`,
    '',
    `**Actor**: ${primaryActor}`,
    '',
    '**Scenario**:',
    '1. The primary workflow encounters a missing dependency, invalid state, or out-of-scope request.',
    '2. The system keeps the scope boundary visible and prevents accidental overbuild or silent failure.',
    '3. Follow-up actions, risks, or approval decisions are captured for later review.',
    '',
    `**Expected outcome**: ${sentence(successItems[2] || 'The team can handle edge cases without losing track of scope guardrails')}`,
    '',
    '## Functional Requirements',
    '',
    '### FR-001 — Primary workflow support',
    '',
    `The system MUST support the primary in-scope workflow for ${normalizeText(input.featureDescription).toLowerCase()} within the agreed scope boundary.`,
    '',
    '**Acceptance Criteria**:',
    '- [ ] The primary actor can complete the core workflow without manual workaround.',
    '- [ ] The resulting business state is persisted or exposed to downstream users as defined by the scope.',
    '',
    '### FR-002 — Business rule enforcement',
    '',
    'The system MUST enforce the business rules, limits, and approval conditions defined for this scope.',
    '',
    '**Acceptance Criteria**:',
    '- [ ] The workflow does not proceed when business rules or scope guardrails are violated.',
    '- [ ] Users are told why an action is blocked, deferred, or requires follow-up.',
    '',
    '### FR-003 — Visibility for affected actors',
    '',
    'The system MUST expose the workflow state and outcomes to the primary and secondary actors identified in this scope.',
    '',
    '**Acceptance Criteria**:',
    '- [ ] Secondary actors can review the workflow outcome using the agreed business context.',
    '- [ ] The workflow state is understandable without relying on undocumented tribal knowledge.',
    '',
    '### FR-004 — Integration alignment',
    '',
    'The system MUST align the workflow with the existing integrations, operating processes, or reference documents identified during discovery.',
    '',
    '**Acceptance Criteria**:',
    '- [ ] The implementation reflects the integration context declared in this scope.',
    '- [ ] Downstream teams are not forced to reverse-engineer missing workflow assumptions.',
    '',
    '### FR-005 — History and traceability',
    '',
    'The system MUST preserve enough workflow history, status context, and change visibility for operational review and support.',
    '',
    '**Acceptance Criteria**:',
    '- [ ] Material workflow outcomes can be reviewed after the primary action completes.',
    '- [ ] Follow-up reviews can identify the reason for a workflow state change.',
    '',
    '### FR-006 — Reporting and operational review',
    '',
    'The system MUST provide the operational visibility needed to review progress, outcomes, or exceptions for this scope.',
    '',
    '**Acceptance Criteria**:',
    '- [ ] Stakeholders can review current state and recent outcomes without querying implementation details directly.',
    '- [ ] Reported information reflects the same business rules enforced by the primary workflow.',
    '',
    '## Data Requirements',
    '',
    '### Schema Changes',
    '',
    '| Table | Purpose |',
    '|-------|---------|',
    `| \`${primaryTable}\` | Stores the current business state for ${normalizeText(input.featureDescription).toLowerCase()} at the company or workflow level. |`,
    `| \`${eventTable}\` | Stores lifecycle events, status transitions, and system-generated workflow actions for this scope. |`,
    `| \`${historyTable}\` | Stores customer-visible or operator-visible history records needed for review, audit, or reporting. |`,
    '',
    '**Schema Notes**:',
    `- The schema MUST reflect the scope boundary: ${sentence(scopeBoundary)}`,
    `- Out-of-scope persistence or unrelated aggregates remain excluded: ${sentence(outOfScope)}`,
    '',
    '## API Routes',
    '',
    '| Method | Route | Description |',
    '|--------|-------|-------------|',
    `| POST | \`${apiBasePath}\` | Create or initiate the primary ${normalizeText(input.featureDescription).toLowerCase()} workflow. |`,
    `| GET | \`${apiBasePath}\` | Return the current workflow summary, status, and key business details for this scope. |`,
    `| PATCH | \`${apiBasePath}\` | Update workflow state, business settings, or approval outcomes within the declared scope. |`,
    `| GET | \`${apiBasePath}/history\` | Return operator-visible or customer-visible workflow history for review. |`,
    `| GET | \`${apiBasePath}/reports\` | Return operational reporting or summary views derived from the current workflow state. |`,
    `| POST | \`${apiBasePath}/events\` | Capture integration, lifecycle, or downstream events that must keep wxKanban state synchronized. |`,
    '',
    '## Frontend Components',
    '',
    '### New Components',
    '',
    '| Component | Path | Description |',
    '|-----------|------|-------------|',
    `| \`${componentBase}PrimaryPanel\` | \`src/client/components/${input.shortName}/${componentBase}PrimaryPanel.tsx\` | Handles the primary user workflow for this scope. |`,
    `| \`${componentBase}HistoryPanel\` | \`src/client/components/${input.shortName}/${componentBase}HistoryPanel.tsx\` | Shows the workflow history, outcomes, or event trail for review. |`,
    `| \`${componentBase}ManagementPanel\` | \`src/client/components/${input.shortName}/${componentBase}ManagementPanel.tsx\` | Lets authorized users review status, business rules, and operational controls. |`,
    `| \`${componentBase}Notice\` | \`src/client/components/${input.shortName}/${componentBase}Notice.tsx\` | Surfaces important state changes, scope guardrails, or user-facing warnings. |`,
    '',
    '### Modified Components',
    '',
    '| Component | Change |',
    '|-----------|--------|',
    `| \`SettingsPage\` | Add entry points, current-state visibility, and management controls for ${normalizeText(input.featureDescription).toLowerCase()}. |`,
    `| \`AdminDashboard\` | Add reporting or operational summary access for the new workflow. |`,
    `| \`${componentBase}Page\` | Add the primary end-user workflow entry point, review states, and exception messaging. |`,
    '',
    '## Success Criteria',
    '',
    ...successItems.map((metric, index) => `${index + 1}. ${sentence(metric)}`),
    '',
    '## Key Entities',
    '',
    '| Entity | Description |',
    '|--------|-------------|',
    `| \`${titleCase(resourceBase)}Workflow\` | Represents the primary business workflow or configuration state introduced by this scope. |`,
    `| \`${titleCase(resourceBase)}Event\` | Represents lifecycle, approval, or synchronization events emitted as the workflow changes state. |`,
    `| \`${titleCase(resourceBase)}HistoryRecord\` | Represents the history or review record shown to users or operators after workflow actions occur. |`,
    `| \`${titleCase(resourceBase)}ReportSnapshot\` | Represents the reporting or summary view used to monitor current status and recent outcomes. |`,
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
  let currentDir = process.cwd();

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

export async function generateNextSpecNumber(): Promise<string> {
  try {
    const scopeDir = join(resolveWorkspaceRoot(), 'specs', 'Project-Scope');
    if (!existsSync(scopeDir)) {
      return '001'; // First spec
    }

    const numbers = readdirSync(scopeDir)
      .map((name) => {
        const match = name.match(/^(\d{3})-.*\.md$/);
        return match ? parseInt(match[1], 10) : Number.NaN;
      })
      .filter((value) => Number.isFinite(value));

    if (numbers.length === 0) {
      return '001';
    }

    const nextNum = Math.max(...numbers) + 1;
    return nextNum.toString().padStart(3, '0');
  } catch (error) {
    logger.error('Error generating spec number', error as Error);
    // Fallback to timestamp-based
    const timestamp = Date.now().toString(36).toUpperCase();
    return timestamp.slice(-3);
  }
}

/**
 * Generate short name from feature description
 */
export function generateShortName(featureDescription: string): string {
  const withoutLeadingNumber = featureDescription.replace(/^\s*\d{3}\s*[-_:]\s*/i, '');
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'with']);

  const tokens = withoutLeadingNumber
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
 * Validate scope document content
 */
export function validateScopeContent(content: string): ScopeValidationResult {
  const overviewContent = extractSectionContent(content, /^##?\s*Overview\b/i);
  const actorsContent = extractSectionContent(content, /^##?\s*Actors\b/i);
  const successMetricsContent = extractSectionContent(content, /^##?\s*(?:Success\s*Metrics|Success\s*Criteria)\b/i);
  const scopeBoundarySectionContent = extractSectionContent(content, /^##?\s*(?:Scope\s*Boundary|In\s*Scope)\b/i);
  const outOfScopeSectionContent = extractSectionContent(content, /^##?\s*Out\s*of\s*Scope\b/i);
  const notesContent = extractSectionContent(content, /^##?\s*Notes\b/i);
  const primaryActor = extractActorValue(actorsContent, 'Primary') || extractCoreDesignValue(content, 'Primary Actor');
  const secondaryActors = extractActorValue(actorsContent, 'Secondary') || extractCoreDesignValue(content, 'Secondary Actors');
  const scopeBoundaryContent = scopeBoundarySectionContent || extractCoreDesignValue(content, 'Scope Boundary');
  const outOfScopeContent = outOfScopeSectionContent || extractCoreDesignValue(content, 'Scope Boundary');
  const businessProblemContent = extractSectionContent(content, /^##?\s*Business\s*Problem\b/i) || overviewContent;
  const successMetrics = extractMetricLines(successMetricsContent);
  const placeholdersFound = uniqueStrings(matchesPlaceholder(content));

  const checks = {
    hasOverview: /##?\s*Overview/i.test(content),
    hasBusinessProblem: isMeaningfulText(businessProblemContent, DEFAULT_SCOPE_CONTENT.businessProblem),
    hasActors: Boolean(primaryActor && secondaryActors),
    hasSuccessMetrics: /##?\s*(?:Success\s*Metrics|Success\s*Criteria)/i.test(content),
    hasScopeBoundary: Boolean(scopeBoundaryContent),
    hasOutOfScope: /##?\s*Out\s*of\s*Scope/i.test(content) || /\bexclude\b/i.test(outOfScopeContent),
    hasOpenQuestions: /##?\s*Open\s*Questions/i.test(content) || /##?\s*Clarifications/i.test(content),
  };

  const minimumCriteriaStatus = {
    businessProblem: isMeaningfulText(businessProblemContent, DEFAULT_SCOPE_CONTENT.businessProblem),
    primaryActor: isMeaningfulText(primaryActor, DEFAULT_SCOPE_CONTENT.primaryActor, 4),
    secondaryActors: isMeaningfulText(secondaryActors, DEFAULT_SCOPE_CONTENT.secondaryActors, 4),
    measurableSuccessMetrics: successMetrics.filter(isMeasurableMetric).length >= 3,
    scopeBoundary: isMeaningfulText(scopeBoundaryContent, DEFAULT_SCOPE_CONTENT.scopeBoundary),
    outOfScope: isMeaningfulText(outOfScopeContent, DEFAULT_SCOPE_CONTENT.outOfScope),
    noPlaceholders: placeholdersFound.length === 0,
  };

  const missingSections: string[] = [];
  if (!checks.hasOverview) missingSections.push('overview');
  if (!checks.hasBusinessProblem) missingSections.push('business_problem');
  if (!checks.hasActors) missingSections.push('actors');
  if (!checks.hasSuccessMetrics) missingSections.push('success_metrics');
  if (!checks.hasScopeBoundary) missingSections.push('scope_boundary');
  if (!checks.hasOutOfScope) missingSections.push('out_of_scope');
  if (!checks.hasOpenQuestions) missingSections.push('open_questions');

  const blockingIssues: string[] = [];
  if (placeholdersFound.length > 0) {
    blockingIssues.push(`Placeholder markers found: ${placeholdersFound.join(', ')}`);
  }
  if (!minimumCriteriaStatus.businessProblem) {
    blockingIssues.push('Business Problem must be specific and non-placeholder.');
  }
  if (!minimumCriteriaStatus.primaryActor) {
    blockingIssues.push('Actors section must identify a primary actor.');
  }
  if (!minimumCriteriaStatus.secondaryActors) {
    blockingIssues.push('Actors section must identify at least one secondary actor.');
  }
  if (!minimumCriteriaStatus.measurableSuccessMetrics) {
    blockingIssues.push('Success Metrics must include at least 3 measurable outcomes.');
  }
  if (!minimumCriteriaStatus.scopeBoundary) {
    blockingIssues.push('Scope Boundary must define what is included.');
  }
  if (!minimumCriteriaStatus.outOfScope) {
    blockingIssues.push('Scope documentation must define what is excluded from this iteration.');
  }

  const scoreSignals = [
    ...Object.values(checks),
    ...Object.values(minimumCriteriaStatus),
  ];
  const score = Math.round((scoreSignals.filter(Boolean).length / scoreSignals.length) * 100);

  const suggestions: string[] = [];
  if (!minimumCriteriaStatus.measurableSuccessMetrics) {
    suggestions.push('Add at least 3 measurable success metrics with targets, percentages, or timing thresholds.');
  }
  if (!minimumCriteriaStatus.businessProblem) {
    suggestions.push('Rewrite the overview or business context so it describes the current pain and desired outcome in concrete language.');
  }
  if (!minimumCriteriaStatus.primaryActor || !minimumCriteriaStatus.secondaryActors) {
    suggestions.push('Identify both a primary actor and at least one secondary actor in the Core Design or Actors section.');
  }
  if (!minimumCriteriaStatus.scopeBoundary || !minimumCriteriaStatus.outOfScope) {
    suggestions.push('Clarify what is included and explicitly state what is out of scope in the Core Design or Constraints sections.');
  }

  const warnings: string[] = [];
  if (!checks.hasOpenQuestions) {
    warnings.push('Clarifications or Open Questions section is missing; add it if any decisions are still pending.');
  }
  if (!/##\s*Data\s*Requirements\b/i.test(content)) {
    warnings.push('Data Requirements section is missing; add it when schema or persistence design matters.');
  }
  if (!/##\s*API\s*Routes\b/i.test(content)) {
    warnings.push('API Routes section is missing; add it when this scope changes server behavior or external integrations.');
  }
  if (!/##\s*Frontend\s*Components\b/i.test(content)) {
    warnings.push('Frontend Components section is missing; add it when this scope changes the UI surface.');
  }
  if (!/align with/i.test(notesContent) && !/##\s*Integration\s*Context\b/i.test(content)) {
    warnings.push('Integration context is not called out explicitly; add it if the scope depends on existing workflows or systems.');
  }

  const isValid = blockingIssues.length === 0 && score >= 80;

  return {
    success: isValid,
    specNumber: 'unknown',
    filePath: 'unknown',
    status: isValid ? 'valid' : 'invalid',
    isValid,
    score,
    checks,
    placeholdersFound,
    blockingIssues,
    minimumCriteriaStatus,
    missingSections,
    suggestions,
    warnings,
    errors: [],
    message: isValid
      ? 'Scope passes required quality gates.'
      : 'Scope failed one or more quality gates. Resolve the blocking issues before running create_specs.',
  };
}

export function createSpecsPreflight(scopeContent: string): ScopeValidationResult {
  return validateScopeContent(scopeContent);
}

/**
 * Build scope document and save to database
 */
export async function buildScope(input: {
  featureDescription: string;
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
}): Promise<BuildScopeResult> {
  try {
    const workspaceRoot = resolveWorkspaceRoot();
    const scopeDir = join(workspaceRoot, 'specs', 'Project-Scope');
    const mode = input.quick ? 'quick' : 'guided';

    const specNumber = input.editSpecNumber || await generateNextSpecNumber();
    const generatedShortName = generateShortName(input.featureDescription);

    let scopeFileName = `${specNumber}-${generatedShortName}.md`;
    if (input.editSpecNumber) {
      const existingFile = readdirSync(scopeDir).find(
        (name) => name.startsWith(`${specNumber}-`) && name.endsWith('.md')
      );
      if (!existingFile) {
        throw new Error(`Scope ${specNumber} not found. Use buildscope without --edit-spec-number to create a new scope.`);
      }
      scopeFileName = existingFile;
    }

    const shortName = scopeFileName.replace(/^\d{3}-/, '').replace(/\.md$/, '');
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
    });

    if (!input.quick && draftAssessment.blockingIssues.length > 0) {
      return {
        success: true,
        mode,
        status: 'draft_interview',
        specNumber,
        shortName,
        sectionsCreated: [],
        questions: draftAssessment.questions,
        qualityScore: draftAssessment.qualityScore,
        blockingIssues: draftAssessment.blockingIssues,
        canProceedToCreateSpecs: false,
        message: `Scope ${specNumber} needs clarification before a draft file can be written.`,
        nextSteps: [
          'Answer the guided questions and rerun buildscope.',
          'Provide businessProblem, primaryActor, secondaryActors, 3 measurable successMetrics, scopeBoundary, and outOfScope.',
        ],
      };
    }

    mkdirSync(scopeDir, { recursive: true });

    // Build scope content
    const scopeContent = buildScopeContent({
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
    });

    const validation = validateScopeContent(scopeContent);

    writeFileSync(absoluteScopePath, scopeContent, 'utf8');

    updateScopeChecklist({
      specNumber,
      shortName,
      sourcePath: filePath,
      scopeContent,
      validation,
    });

    logger.info('Scope built successfully', { specNumber, filePath });

    return {
      success: true,
      mode,
      status: input.templateOnly ? 'template_only' : input.editSpecNumber ? 'updated' : 'created',
      specNumber,
      shortName,
      filePath,
      checklistPath,
      scopeContent,
      sectionsCreated: ['overview', 'business_problem', 'actors', 'success_metrics', 'scope_boundary', 'out_of_scope', 'open_questions'],
      questions: [],
      qualityScore: validation.score,
      blockingIssues: validation.blockingIssues,
      canProceedToCreateSpecs: validation.isValid,
      message: validation.isValid
        ? `Scope ${specNumber} created and ready for spec generation.`
        : `Scope ${specNumber} created, but it still has blocking issues to resolve before create_specs.`,
      nextSteps: validation.isValid
        ? ['Run validatescope to confirm the saved draft.', 'Use create_specs once the scope is approved.']
        : ['Run validatescope to review blockers.', 'Resolve placeholder or quality issues before create_specs.'],
    };
  } catch (error) {
    logger.error('Error building scope', error as Error, {
      featureDescription: input.featureDescription,
    });
    throw error;
  }
}

/**
 * Validate scope by spec number or file path
 */
export async function validateScope(input: {
  specNumber?: string;
  filePath?: string;
  projectId?: string;
}): Promise<ScopeValidationResult> {
  try {
    let content: string | null = null;
    let actualSpecNumber = input.specNumber || 'unknown';
    let actualFilePath = input.filePath || `specs/Project-Scope/${actualSpecNumber}-*.md`;

    // Try to get content from database
    if (input.specNumber && input.projectId) {
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

    // If still no content, return error result
    if (!content) {
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
        blockingIssues: ['Scope document not found. Please build or locate the scope before validating it.'],
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
        suggestions: ['Scope document not found. Please build the scope first.'],
        warnings: [],
        errors: [`Could not find scope for spec ${actualSpecNumber}`],
        message: `Could not find scope for spec ${actualSpecNumber}.`,
      };
    }

    // Validate the content
    const result = validateScopeContent(content);
    result.specNumber = actualSpecNumber;
    result.filePath = actualFilePath;

    const normalizedPath = actualFilePath.replace(/\\/g, '/');
    const match = normalizedPath.match(/^specs\/Project-Scope\/(\d{3})-([^/]+)\.md$/i);
    if (match) {
      updateScopeChecklist({
        specNumber: match[1],
        shortName: match[2],
        sourcePath: normalizedPath,
        scopeContent: content,
        validation: result,
      });
    }

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
