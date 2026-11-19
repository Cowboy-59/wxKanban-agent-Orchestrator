export type ProposalStatus = "pending" | "good_idea" | "accepted" | "rejected";

export type ProposalPriority = "low" | "medium" | "high";

export interface ProjectProposal {
  id: string;
  companyid: string;
  title: string;
  description: string | null;
  priority: ProposalPriority;
  estimatedeffort: string | null;
  status: ProposalStatus;
  rejectionreason: string | null;
  proposeddate: string;
  source: string;
  projectid: string | null;
  createdbyid: string;
  createdat: string;
  updatedat: string;
}

/**
 * Valid status transitions for project proposals.
 * Enforced server-side — invalid transitions return 422.
 */
export const VALID_PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ["good_idea", "rejected"],
  good_idea: ["accepted", "rejected"],
  accepted: [], // terminal — triggers Create Project flow
  rejected: ["pending"], // can be reopened
};

/**
 * Statuses that require a rejection reason.
 */
export const REQUIRES_REASON: ProposalStatus[] = ["rejected"];
