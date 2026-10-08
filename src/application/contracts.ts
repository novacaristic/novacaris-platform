import type { ApplicantProfile, FundingOpportunity } from "../funding/scoring.js";
import type { MPRIMEProviderProfile } from "../maryland/mprime.js";
import type { RegulatoryGraph, EvidenceState } from "../domain/regulatory.js";
import type { ProviderIntake } from "../commercial/intake.js";
import type { NOVAAssessmentPackage } from "../commercial/orchestrator.js";
import type { DashboardViewModel } from "../portal/dashboard-model.js";

export interface AssessmentRequest {
  provider: ProviderIntake;
  regulatoryGraph: RegulatoryGraph;
  evidenceStates: Record<string, EvidenceState>;
  mprime?: MPRIMEProviderProfile;
  fundingOpportunities?: FundingOpportunity[];
  applicant?: ApplicantProfile;
}
export interface AssessmentResponse { package: NOVAAssessmentPackage; dashboard: DashboardViewModel; }
export interface ApplicationHealth { ok: true; service: "novacaris-application"; version: string; }
export interface HumanReviewRequest {
  authorizationId: string;
  decision: "APPROVED" | "REJECTED";
  rationale: string;
}

export interface ApplicationRoute {
  method: "GET" | "POST"; path: string; purpose: string; requiresAuthentication: boolean;
}
export const APPLICATION_ROUTES: ApplicationRoute[] = [
  { method: "GET", path: "/api/health", purpose: "application-health", requiresAuthentication: false },
  { method: "GET", path: "/api/workspace", purpose: "workspace-dashboard", requiresAuthentication: true },
  { method: "GET", path: "/api/assessments", purpose: "assessment-history", requiresAuthentication: true },
  { method: "POST", path: "/api/assessments", purpose: "run-nova-assessment", requiresAuthentication: true },
  { method: "POST", path: "/api/evidence", purpose: "submit-evidence-and-reassess", requiresAuthentication: true },
  { method: "GET", path: "/api/review", purpose: "human-review-queue", requiresAuthentication: true },
  { method: "POST", path: "/api/review/authorization", purpose: "decide-human-authorization", requiresAuthentication: true },
];
