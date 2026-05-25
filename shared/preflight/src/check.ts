// Spec 029 / T001 — main scope preflight scoring.
// Extracted byte-for-byte from mcp-server/src/utils/project-kit.ts
// validateScopeContent(). Behavior is identical; the return type matches
// the original ScopeValidationResult.

import {
  isMeaningfulText,
  isMeasurableMetric,
  matchesPlaceholder,
  uniqueStrings,
} from './text-utils.js';
import {
  extractActorValue,
  extractCoreDesignValue,
  extractMetricLines,
  extractSectionContent,
} from './extractors.js';
import { DEFAULT_SCOPE_CONTENT } from './defaults.js';

// [SCOPE 029 / T001] BEGIN — ScopeValidationResult (preflight return shape)
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
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — runPreflight (canonical scope quality scoring)
export function runPreflight(content: string): ScopeValidationResult {
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
// [SCOPE 029 / T001] END
