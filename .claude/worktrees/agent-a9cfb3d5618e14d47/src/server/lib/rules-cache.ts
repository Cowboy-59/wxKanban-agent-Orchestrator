/**
 * Compliance Rules Cache
 *
 * In-memory cache for immutable compliance rules (SOC2, HiTrust).
 * Rules are loaded once at startup and cached to avoid repeated database queries.
 *
 * Implements T101: Add caching for compliance rules (immutable after startup)
 */

import { logger } from '~/lib/logger';
import {
  SecurityStandard,
  SOC2_PROHIBITED_COMBINATIONS,
  HITRUST_PROHIBITED_COMBINATIONS,
  DEFAULT_DUTIES_BY_STANDARD,
  EXEMPT_FROM_CONFLICTS,
  dutiesConflict,
  getConflictingRules,
} from '~/lib/compliance-rules';

/**
 * Rules cache singleton
 * Holds all immutable compliance rules in memory
 */
class RulesCache {
  private initialized: boolean = false;
  private soc2Rules = SOC2_PROHIBITED_COMBINATIONS;
  private hitrustRules = HITRUST_PROHIBITED_COMBINATIONS;
  private defaultDuties = DEFAULT_DUTIES_BY_STANDARD;
  private exemptDuties = EXEMPT_FROM_CONFLICTS;

  /**
   * Initialize cache at application startup
   * Called once by application bootstrap code
   */
  initialize(): void {
    if (this.initialized) {
      logger.debug('Rules cache already initialized, skipping');
      return;
    }

    const startTime = Date.now();

    // Pre-compute rule metadata for faster lookups
    this.soc2Rules = SOC2_PROHIBITED_COMBINATIONS;
    this.hitrustRules = HITRUST_PROHIBITED_COMBINATIONS;
    this.defaultDuties = DEFAULT_DUTIES_BY_STANDARD;
    this.exemptDuties = EXEMPT_FROM_CONFLICTS;

    const duration = Date.now() - startTime;

    logger.info(
      {
        soc2RuleCount: this.soc2Rules.length,
        hitrustRuleCount: this.hitrustRules.length,
        defaultDutyCount: Object.keys(this.defaultDuties).length,
        exemptDutyCount: this.exemptDuties.length,
        durationMs: duration,
      },
      'Compliance rules cache initialized'
    );

    this.initialized = true;
  }

  /**
   * Get all prohibited duty combinations for a security standard
   * @param standard Security standard (SOC2 or HITRUST)
   * @returns Cached rules array
   */
  getProhibitedCombinations(standard: SecurityStandard) {
    return standard === SecurityStandard.HITRUST
      ? this.hitrustRules
      : this.soc2Rules;
  }

  /**
   * Get default duties for a security standard
   * @param standard Security standard
   * @returns Default duties array
   */
  getDefaultDuties(standard: SecurityStandard) {
    return this.defaultDuties[standard] || [];
  }

  /**
   * Check if a duty is exempt from conflict restrictions
   * @param duty Duty name to check
   * @returns true if duty is exempt from conflicts
   */
  isExemptFromConflicts(duty: string): boolean {
    return this.exemptDuties.includes(duty as any);
  }

  /**
   * Check if two duties conflict under a given standard
   * Uses cached rules for fast lookup
   * @param duty1 First duty
   * @param duty2 Second duty
   * @param standard Security standard
   * @returns true if duties conflict
   */
  dutiesConflict(duty1: string, duty2: string, standard: SecurityStandard): boolean {
    return dutiesConflict(duty1, duty2, standard);
  }

  /**
   * Get conflicting rules for a set of duties
   * @param duties Array of duty names
   * @param standard Security standard
   * @returns Array of violated rules
   */
  getConflictingRules(duties: string[], standard: SecurityStandard) {
    return getConflictingRules(duties, standard);
  }

  /**
   * Get rule count for a security standard
   * @param standard Security standard
   * @returns Number of rules
   */
  getRuleCount(standard: SecurityStandard): number {
    return this.getProhibitedCombinations(standard).length;
  }

  /**
   * Get all standards' rule counts
   * @returns Object with rule counts per standard
   */
  getRuleCounts(): Record<SecurityStandard, number> {
    return {
      [SecurityStandard.SOC2]: this.soc2Rules.length,
      [SecurityStandard.HITRUST]: this.hitrustRules.length,
    };
  }

  /**
   * Reset cache (for testing only)
   */
  reset(): void {
    this.initialized = false;
    logger.debug('Rules cache reset');
  }
}

// Singleton instance
const rulesCache = new RulesCache();

/**
 * Get the global rules cache instance
 * @returns Rules cache singleton
 */
export function getRulesCache(): RulesCache {
  if (!rulesCache['initialized']) {
    logger.warn(
      'Rules cache not initialized - call initializeRulesCache() at startup'
    );
  }
  return rulesCache;
}

/**
 * Initialize rules cache at application startup
 * Call this once during application bootstrap
 */
export function initializeRulesCache(): void {
  rulesCache.initialize();
}

/**
 * Export cache for testing
 */
export { RulesCache };
