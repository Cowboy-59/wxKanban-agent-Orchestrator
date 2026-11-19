import { logger } from '~/server/lib/logger.js';

/**
 * Specification Lifecycle Phases
 */
export type SpecificationPhase = 'DESIGN' | 'IMPLEMENTATION' | 'QA' | 'HUMAN_TESTING' | 'BETA' | 'RELEASE';

/**
 * Specification Interface
 */
export interface Specification {
  id: string;
  projectid: string;
  specnumber: string;
  title: string;
  content: string;
  status: 'draft' | 'review' | 'approved';
  createdat: Date;
  approvedat?: Date;
  updatedat: Date;
}

/**
 * SpecificationLifecycleService - STUB
 *
 * NOTE: This service is disabled pending schema updates.
 * The current database schema does not support the complex
 * specification phase lifecycle tracking that this service expects.
 *
 * All methods throw "Not yet implemented" errors.
 */
export class SpecificationLifecycleService {
  static readonly PHASE_DEFINITIONS: Record<SpecificationPhase, any> = {
    DESIGN: {},
    IMPLEMENTATION: {},
    QA: {},
    HUMAN_TESTING: {},
    BETA: {},
    RELEASE: {},
  };

  static async createSpecification(
    _userid: string,
    _companyid: string,
    _title: string,
    _description: string
  ): Promise<Specification> {
    logger.warn('SpecificationLifecycleService not yet implemented');
    throw new Error('SpecificationLifecycleService not yet implemented');
  }

  static async getSpecification(
    _specificationid: string,
    _userid: string
  ): Promise<Specification | null> {
    throw new Error('SpecificationLifecycleService not yet implemented');
  }

  static async getActiveSpecifications(_userid: string): Promise<Specification[]> {
    return [];
  }

  static async getSpecificationsByPhase(
    _userid: string,
    _phase: SpecificationPhase
  ): Promise<Specification[]> {
    return [];
  }

  static async getCurrentPhaseInfo(
    _specificationid: string,
    _userid: string
  ): Promise<any> {
    throw new Error('SpecificationLifecycleService not yet implemented');
  }

  static getPhaseDescription(phase: SpecificationPhase): string {
    return phase;
  }

  static async getPhaseHistory(
    _specificationid: string,
    _userid: string
  ): Promise<any[]> {
    return [];
  }

  static async getLifecycleProgress(
    _specificationid: string,
    _userid: string
  ): Promise<any> {
    throw new Error('SpecificationLifecycleService not yet implemented');
  }

  static validatePhaseTransition(_fromPhase: SpecificationPhase, _toPhase: SpecificationPhase): boolean {
    return true;
  }

  static async transitionPhase(_request: any): Promise<any> {
    throw new Error('SpecificationLifecycleService not yet implemented');
  }

  static async updatePhaseNotes(
    _specificationid: string,
    _userid: string,
    _notes: string,
    _blockers?: string[]
  ): Promise<any> {
    throw new Error('SpecificationLifecycleService not yet implemented');
  }

  static async archiveSpecification(
    _specificationid: string,
    _userid: string
  ): Promise<boolean> {
    return false;
  }
}
