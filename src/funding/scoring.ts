export type FundingFit = "EXCELLENT" | "STRONG" | "POSSIBLE" | "WEAK" | "INELIGIBLE";

export interface FundingOpportunity {
  id: string;
  title: string;
  funder: string;
  jurisdiction: string;
  deadline?: string;
  applicantTypes: string[];
  priorityTopics: string[];
  requiredCapabilities: string[];
  allowedActivities: string[];
  sourceUrl: string;
  sourceVerifiedAt: string;
}

export interface ApplicantProfile {
  organizationType: string;
  jurisdiction: string;
  services: string[];
  populations: string[];
  capabilities: string[];
  partnerships: string[];
  evidenceAssets: string[];
  desiredActivities: string[];
}

export interface FundingScore {
  opportunityId: string;
  fit: FundingFit;
  score: number;
  breakdown: {
    eligibility: number; mission: number; geography: number;
    capability: number; evidence: number; activity: number; timing: number;
  };
  matchedSignals: string[];
  gaps: string[];
  recommendedAction: "PURSUE" | "PARTNER" | "MONITOR" | "DO_NOT_PURSUЕ";
}

function overlap(a: string[], b: string[]): number {
  if (!a.length) return 0;
  const set = new Set(b.map(x => x.toLowerCase()));
  return a.filter(x => set.has(x.toLowerCase())).length / a.length;
}

function daysUntil(deadline: string | undefined, now: Date): number | undefined {
  if (!deadline) return undefined;
  return Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86400000);
}

export function scoreFundingOpportunity(
  opportunity: FundingOpportunity,
  applicant: ApplicantProfile,
  now = new Date()
): FundingScore {
  const applicantTypeMatch = opportunity.applicantTypes
    .map(x => x.toLowerCase())
    .includes(applicant.organizationType.toLowerCase());

  const geography = opportunity.jurisdiction === "US" ||
    opportunity.jurisdiction.toLowerCase() === applicant.jurisdiction.toLowerCase() ? 100 : 0;

  const mission = Math.round(overlap(
    opportunity.priorityTopics,
    [...applicant.services, ...applicant.populations]
  ) * 100);

  const capability = Math.round(overlap(
    opportunity.requiredCapabilities,
    applicant.capabilities
  ) * 100);

  const evidence = Math.round(overlap(
    opportunity.requiredCapabilities,
    applicant.evidenceAssets
  ) * 100);

  const activity = Math.round(overlap(
    opportunity.allowedActivities,
    applicant.desiredActivities
  ) * 100);

  const days = daysUntil(opportunity.deadline, now);
  const timing = days === undefined ? 60 : days < 0 ? 0 : days <= 14 ? 100 : days <= 45 ? 85 : 70;
  const eligibility = applicantTypeMatch && geography ? 100 : applicantTypeMatch ? 55 : 0;

  const score = Math.round(
    eligibility * 0.30 + mission * 0.20 + geography * 0.10 +
    capability * 0.10 + evidence * 0.10 + activity * 0.10 + timing * 0.10
  );

  const matchedSignals: string[] = [];
  const gaps: string[] = [];

  if (applicantTypeMatch) matchedSignals.push("Applicant type matches");
  else gaps.push("Applicant type does not match the published eligibility profile");
  if (geography === 100) matchedSignals.push("Geography matches");
  else gaps.push("Geographic eligibility is not established");
  if (mission >= 60) matchedSignals.push("Strong mission/population overlap");
  else gaps.push("Mission or population fit is weak");
  if (capability >= 60) matchedSignals.push("Required capabilities are substantially present");
  else gaps.push("Required capabilities are incomplete");
  if (evidence >= 60) matchedSignals.push("Evidence assets support the opportunity");
  else gaps.push("Evidence package needs strengthening");
  if (activity >= 60) matchedSignals.push("Proposed activities align");
  else gaps.push("Desired activities do not clearly align");

  let fit: FundingFit;
  let recommendedAction: FundingScore["recommendedAction"];

  if (eligibility === 0) {
    fit = "INELIGIBLE";
    recommendedAction = "DO_NOT_PURSUЕ";
  } else if (score >= 85) {
    fit = "EXCELLENT";
    recommendedAction = "PURSUE";
  } else if (score >= 70) {
    fit = "STRONG";
    recommendedAction = "PURSUE";
  } else if (score >= 50) {
    fit = "POSSIBLE";
    recommendedAction = "PARTNER";
  } else {
    fit = "WEAK";
    recommendedAction = "MONITOR";
  }

  return {
    opportunityId: opportunity.id, fit, score,
    breakdown: { eligibility, mission, geography, capability, evidence, activity, timing },
    matchedSignals, gaps, recommendedAction
  };
}
