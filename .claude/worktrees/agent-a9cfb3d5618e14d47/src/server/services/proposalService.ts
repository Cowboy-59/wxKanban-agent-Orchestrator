import { db } from '~/db/client.js';
import { projectproposals } from '~/db/schema/projectproposal.js';
import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
import type { ProposalStatus } from '~/shared/types/proposals.js';
import { VALID_PROPOSAL_TRANSITIONS, REQUIRES_REASON } from '~/shared/types/proposals.js';

const logger = createLogger('proposal-service');

export interface CreateProposalInput {
  title: string;
  description?: string;
  priority?: string;
  estimatedeffort?: string;
  source: string;
}

export interface UpdateProposalInput {
  title?: string;
  description?: string;
  priority?: string;
  estimatedeffort?: string;
}

export interface StatusTransitionInput {
  status: ProposalStatus;
  rejectionreason?: string;
}

/**
 * List all proposals for a company, sorted by status group then proposed date.
 */
export async function listProposals(companyid: string, statusFilter?: string) {
  try {
    let query = db
      .select()
      .from(projectproposals)
      .where(eq(projectproposals.companyid, companyid))
      .orderBy(desc(projectproposals.proposeddate));

    const results = await query;

    if (statusFilter) {
      return results.filter((p) => p.status === statusFilter);
    }

    return results;
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to list proposals');
    throw new Error('Failed to list proposals');
  }
}

/**
 * Get a single proposal by ID, scoped to company.
 */
export async function getProposalById(companyid: string, proposalId: string) {
  try {
    const [proposal] = await db
      .select()
      .from(projectproposals)
      .where(
        and(
          eq(projectproposals.id, proposalId),
          eq(projectproposals.companyid, companyid),
        )
      )
      .limit(1);

    return proposal || null;
  } catch (error) {
    logger.error({ error, companyid, proposalId }, 'Failed to get proposal');
    throw new Error('Failed to get proposal');
  }
}

/**
 * Create a new proposal with status "pending".
 */
export async function createProposal(
  companyid: string,
  createdbyid: string,
  input: CreateProposalInput,
) {
  try {
    const [proposal] = await db
      .insert(projectproposals)
      .values({
        companyid,
        createdbyid,
        title: input.title,
        description: input.description || null,
        priority: input.priority || 'medium',
        estimatedeffort: input.estimatedeffort || null,
        source: input.source,
        status: 'pending',
        proposeddate: new Date(),
      })
      .returning();

    logger.info({ proposalId: proposal.id, companyid, title: input.title }, 'Proposal created');
    return proposal;
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to create proposal');
    throw new Error('Failed to create proposal');
  }
}

/**
 * Update proposal fields (not status — use transitionStatus for that).
 */
export async function updateProposal(
  companyid: string,
  proposalId: string,
  input: UpdateProposalInput,
) {
  try {
    const existing = await getProposalById(companyid, proposalId);
    if (!existing) return null;

    // Proposals linked to a project are read-only
    if (existing.projectid) {
      throw new Error('Cannot update a proposal that has been converted to a project');
    }

    const [updated] = await db
      .update(projectproposals)
      .set({
        ...input,
        updatedat: new Date(),
      })
      .where(
        and(
          eq(projectproposals.id, proposalId),
          eq(projectproposals.companyid, companyid),
        )
      )
      .returning();

    logger.info({ proposalId, companyid }, 'Proposal updated');
    return updated;
  } catch (error) {
    logger.error({ error, companyid, proposalId }, 'Failed to update proposal');
    throw error;
  }
}

/**
 * Transition proposal status with enforcement.
 * Returns { success, proposal?, error? }.
 */
export async function transitionStatus(
  companyid: string,
  proposalId: string,
  input: StatusTransitionInput,
) {
  try {
    const existing = await getProposalById(companyid, proposalId);
    if (!existing) {
      return { success: false, error: 'Proposal not found' };
    }

    const currentStatus = existing.status as ProposalStatus;
    const newStatus = input.status;

    // Validate transition
    const allowed = VALID_PROPOSAL_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid transition: ${currentStatus} -> ${newStatus}. Allowed: ${(allowed || []).join(', ') || 'none (terminal status)'}`,
      };
    }

    // Require rejection reason
    if (REQUIRES_REASON.includes(newStatus) && !input.rejectionreason) {
      return { success: false, error: 'Rejection reason is required' };
    }

    const [updated] = await db
      .update(projectproposals)
      .set({
        status: newStatus,
        rejectionreason: newStatus === 'rejected' ? input.rejectionreason : existing.rejectionreason,
        updatedat: new Date(),
      })
      .where(
        and(
          eq(projectproposals.id, proposalId),
          eq(projectproposals.companyid, companyid),
        )
      )
      .returning();

    logger.info(
      { proposalId, companyid, from: currentStatus, to: newStatus },
      'Proposal status transitioned',
    );

    return { success: true, proposal: updated };
  } catch (error) {
    logger.error({ error, companyid, proposalId }, 'Failed to transition proposal status');
    throw new Error('Failed to transition proposal status');
  }
}

/**
 * Soft-delete a proposal.
 */
export async function deleteProposal(companyid: string, proposalId: string) {
  try {
    const existing = await getProposalById(companyid, proposalId);
    if (!existing) return false;

    await db
      .delete(projectproposals)
      .where(
        and(
          eq(projectproposals.id, proposalId),
          eq(projectproposals.companyid, companyid),
        )
      );

    logger.info({ proposalId, companyid }, 'Proposal deleted');
    return true;
  } catch (error) {
    logger.error({ error, companyid, proposalId }, 'Failed to delete proposal');
    throw new Error('Failed to delete proposal');
  }
}

/**
 * Link a proposal to a created project (called after project creation).
 */
export async function linkProposalToProject(
  companyid: string,
  proposalId: string,
  projectid: string,
) {
  try {
    const [updated] = await db
      .update(projectproposals)
      .set({
        projectid,
        updatedat: new Date(),
      })
      .where(
        and(
          eq(projectproposals.id, proposalId),
          eq(projectproposals.companyid, companyid),
        )
      )
      .returning();

    logger.info({ proposalId, projectid, companyid }, 'Proposal linked to project');
    return updated;
  } catch (error) {
    logger.error({ error, companyid, proposalId, projectid }, 'Failed to link proposal to project');
    throw new Error('Failed to link proposal to project');
  }
}
