export type ReadinessStatus = "RED" | "AMBER" | "GREEN" | "HUMAN_REVIEW";

export type ReadinessDomain =
  | "ORGANIZATION"
  | "SITE"
  | "SERVICE"
  | "REGULATORY"
  | "EVIDENCE"
  | "MPRIME"
  | "OPERATIONS"
  | "FUNDING"
  | "AI_GOVERNANCE";

export type FindingPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ReadinessIntake {
  organizationId: string;
  organizationName: string;
  organizationType: string;
  jurisdictions: string[];
  siteIds: string[];
  serviceIds: string[];
  payerPrograms: string[];
  operatingStage: "PLANNING" | "LAUNCHING" | "OPERATING" | "EXPANDING";
  primaryObjective: string;
  fundingObjective?: string;
  technologyObjective?: string;
  knownConcerns?: string[];
}

export interface ReadinessFinding {
  id: string;
  domain: ReadinessDomain;
  priority: FindingPriority;
  status: ReadinessStatus;
  title: string;
  description: string;
  evidenceIds: string[];
  recommendedActions: string[];
  humanReviewRequired: boolean;
}

export interface ReadinessAssessment {
  id: string;
  organizationId: string;
  createdAt: string;
  ruleVersion: string;
  overallScore: number;
  overallStatus: ReadinessStatus;
  domainScores: Partial<Record<ReadinessDomain, number>>;
  findings: ReadinessFinding[];
  academyRecommendations: string[];
  consultingRecommendations: string[];
  softwareRecommendations: string[];
  humanReviewRequired: boolean;
}

export function readinessStatus(score: number): ReadinessStatus {
  if (score >= 80) return "GREEN";
  if (score >= 60) return "AMBER";
  return "RED";
}

export function buildReadinessAssessment(
  intake: ReadinessIntake,
  findings: ReadinessFinding[],
  ruleVersion = "NOVA-READINESS-2026-10",
): ReadinessAssessment {
  const scores = findings.map((finding) => {
    if (finding.status === "GREEN") return 100;
    if (finding.status === "AMBER") return 70;
    if (finding.status === "HUMAN_REVIEW") return 50;
    if (finding.priority === "CRITICAL") return 20;
    if (finding.priority === "HIGH") return 35;
    if (finding.priority === "MEDIUM") return 55;
    return 70;
  });

  const overallScore =
    scores.length === 0
      ? 0
      : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);

  const domainScores: Partial<Record<ReadinessDomain, number>> = {};
  for (const finding of findings) {
    const value =
      finding.status === "GREEN"
        ? 100
        : finding.status === "AMBER"
          ? 70
          : finding.status === "HUMAN_REVIEW"
            ? 50
            : finding.priority === "CRITICAL"
              ? 20
              : finding.priority === "HIGH"
                ? 35
                : 55;

    const current = domainScores[finding.domain];
    domainScores[finding.domain] =
      current === undefined ? value : Math.round((current + value) / 2);
  }

  const humanReviewRequired = findings.some((finding) => finding.humanReviewRequired);

  return {
    id: `readiness-${intake.organizationId}-${Date.now()}`,
    organizationId: intake.organizationId,
    createdAt: new Date().toISOString(),
    ruleVersion,
    overallScore,
    overallStatus: humanReviewRequired ? "HUMAN_REVIEW" : readinessStatus(overallScore),
    domainScores,
    findings,
    academyRecommendations: [],
    consultingRecommendations: [],
    softwareRecommendations: [],
    humanReviewRequired,
  };
}
