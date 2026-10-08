import type { ReadinessAssessment } from "../commercial/readiness.js";
import type { ProviderIntake } from "../commercial/intake.js";
import type { NOVAAssessmentPackage } from "../commercial/orchestrator.js";

export type PortalRole =
  | "OWNER"
  | "ADMIN"
  | "COMPLIANCE"
  | "OPERATIONS"
  | "CLINICAL"
  | "FINANCE"
  | "VIEWER";

export interface CustomerWorkspace {
  organizationId: string;
  organizationName: string;
  roles: Record<string, PortalRole>;
  intake: ProviderIntake;
  assessmentHistory: ReadinessAssessment[];
  latestAssessmentId?: string;
}

export interface PortalFinding {
  id: string;
  domain: string;
  priority: string;
  status: string;
  title: string;
  actions: string[];
  humanReviewRequired: boolean;
}

export interface PortalAction {
  id: string;
  title: string;
  sourceFindingId: string;
  status: "OPEN" | "IN_REVIEW" | "COMPLETED";
  requiresHumanAuthorization: boolean;
}

export interface CustomerDashboard {
  organizationId: string;
  organizationName: string;
  readiness: {
    score: number;
    status: string;
    ruleVersion: string;
    assessedAt: string;
  } | null;
  findings: PortalFinding[];
  actions: PortalAction[];
  academyRecommendations: string[];
  consultingRecommendations: string[];
  softwareRecommendations: string[];
  humanReviewCount: number;
}

function assessmentActions(assessment: ReadinessAssessment): PortalAction[] {
  return assessment.findings.flatMap((finding) =>
    finding.recommendedActions.map((title, index) => ({
      id: `action-${finding.id}-${index + 1}`,
      title,
      sourceFindingId: finding.id,
      status: "OPEN" as const,
      requiresHumanAuthorization: finding.humanReviewRequired,
    })),
  );
}

export function buildCustomerDashboard(
  workspace: CustomerWorkspace,
  latestPackage?: NOVAAssessmentPackage,
): CustomerDashboard {
  const assessment =
    latestPackage?.assessment ??
    workspace.assessmentHistory.find((item) => item.id === workspace.latestAssessmentId) ??
    workspace.assessmentHistory[workspace.assessmentHistory.length - 1];

  if (!assessment) {
    return {
      organizationId: workspace.organizationId,
      organizationName: workspace.organizationName,
      readiness: null,
      findings: [],
      actions: [],
      academyRecommendations: [],
      consultingRecommendations: [],
      softwareRecommendations: [],
      humanReviewCount: 0,
    };
  }

  return {
    organizationId: workspace.organizationId,
    organizationName: workspace.organizationName,
    readiness: {
      score: assessment.overallScore,
      status: assessment.overallStatus,
      ruleVersion: assessment.ruleVersion,
      assessedAt: assessment.createdAt,
    },
    findings: assessment.findings.map((finding) => ({
      id: finding.id,
      domain: finding.domain,
      priority: finding.priority,
      status: finding.status,
      title: finding.title,
      actions: finding.recommendedActions,
      humanReviewRequired: finding.humanReviewRequired,
    })),
    actions: assessmentActions(assessment),
    academyRecommendations: assessment.academyRecommendations,
    consultingRecommendations: assessment.consultingRecommendations,
    softwareRecommendations: assessment.softwareRecommendations,
    humanReviewCount: assessment.findings.filter((finding) => finding.humanReviewRequired).length,
  };
}
