export type SalesStage =
  | "qualification"
  | "discovery"
  | "solution_fit"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export interface QualificationCriterion {
  key: string;
  weight: number;
  satisfied: boolean | null;
}

export function scoreQualification(
  criteria: QualificationCriterion[],
): { score: number | null; missing: string[] } {
  const missing = criteria
    .filter((criterion) => criterion.satisfied === null)
    .map((criterion) => criterion.key);

  if (criteria.length === 0 || missing.length > 0) {
    return { score: null, missing };
  }

  const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0) {
    return { score: null, missing: ["INVALID_CRITERIA_WEIGHTS"] };
  }

  const achieved = criteria
    .filter((criterion) => criterion.satisfied)
    .reduce((sum, item) => sum + item.weight, 0);

  return { score: Math.round((achieved / totalWeight) * 10000) / 100, missing: [] };
}

export interface SalesDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  verifyProposalApproved(opportunityId: string): Promise<boolean>;
  createConsultingEngagement(opportunityId: string): Promise<string>;
}

export async function convertWonOpportunity(
  deps: SalesDependencies,
  opportunityId: string,
  stage: SalesStage,
): Promise<{ converted: boolean; engagementId?: string; reason?: string }> {
  if (stage !== "closed_won") {
    return { converted: false, reason: "OPPORTUNITY_NOT_WON" };
  }

  if (!(await deps.verifyProposalApproved(opportunityId))) {
    await deps.recordEvent("sales.conversion.blocked", {
      opportunityId,
      reason: "APPROVED_PROPOSAL_REQUIRED",
    });
    return { converted: false, reason: "APPROVED_PROPOSAL_REQUIRED" };
  }

  const engagementId = await deps.createConsultingEngagement(opportunityId);

  await deps.recordEvent("sales.opportunity.converted", {
    opportunityId,
    engagementId,
  });

  return { converted: true, engagementId };
}
