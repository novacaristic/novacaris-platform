import { runNOVAAssessment, type NOVAAssessmentInput, type NOVAAssessmentPackage } from "../commercial/orchestrator.js";
import type { RegulatoryGraph, EvidenceState } from "../domain/regulatory.js";
import type { MPRIMEProviderProfile } from "../maryland/mprime.js";
import type { FundingOpportunity, ApplicantProfile } from "../funding/scoring.js";
import type { SessionContext } from "./workspace.js";
import type { WorkspaceRepository } from "./workspace-repository.js";
import type { EvidenceRepository } from "./evidence-service.js";
import { evidenceRowsToDomain, toEvidenceRow } from "./evidence-service.js";
import { buildCustomerDashboard, type CustomerWorkspace } from "../portal/customer-portal.js";
import { buildDashboardViewModel, type DashboardViewModel } from "../portal/dashboard-model.js";
import type { ProviderIntake } from "../commercial/intake.js";

export interface AssessmentRunContext {
  regulatoryGraph: RegulatoryGraph;
  evidenceStates: Record<string, EvidenceState>;
  mprime?: MPRIMEProviderProfile;
  fundingOpportunities?: FundingOpportunity[];
  applicant?: ApplicantProfile;
  now?: Date;
}
export interface AssessmentRunResult { package: NOVAAssessmentPackage; dashboard: DashboardViewModel; }

export async function runWorkspaceAssessment(
  session: SessionContext, context: AssessmentRunContext,
  workspaceRepository: WorkspaceRepository, evidenceRepository: EvidenceRepository,
  provider?: ProviderIntake,
): Promise<AssessmentRunResult> {
  const intake = provider ?? await workspaceRepository.getIntake(session);
  if (!intake) throw new Error("Provider intake is required before assessment.");
  if (intake.intake.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");

  const evidenceRows = await evidenceRepository.listEvidence(session);
  const input: NOVAAssessmentInput = {
    provider: intake, regulatoryGraph: context.regulatoryGraph,
    evidence: evidenceRowsToDomain(evidenceRows), evidenceStates: context.evidenceStates,
    ...(context.mprime ? { mprime: context.mprime } : {}),
    ...(context.fundingOpportunities ? { fundingOpportunities: context.fundingOpportunities } : {}),
    ...(context.applicant ? { applicant: context.applicant } : {}),
    ...(context.now ? { now: context.now } : {}),
  };

  const result = runNOVAAssessment(input);
  await workspaceRepository.saveIntake(session, intake);
  await workspaceRepository.saveAssessment(session, result.assessment);
  const workspace = await workspaceRepository.getWorkspace(session);
  if (!workspace) throw new Error("Workspace not found after assessment.");

  const customerWorkspace: CustomerWorkspace = {
    organizationId: workspace.organizationId, organizationName: workspace.organizationName,
    roles: Object.fromEntries(session.roles.map((role) => [session.userId, role])),
    intake, assessmentHistory: [result.assessment], latestAssessmentId: result.assessment.id,
  };
  const dashboard = buildDashboardViewModel(buildCustomerDashboard(customerWorkspace, result));
  return { package: result, dashboard };
}

export async function reassessAfterEvidenceChange(
  session: SessionContext, submission: { id: string; kind: string; payload: unknown },
  context: AssessmentRunContext, workspaceRepository: WorkspaceRepository,
  evidenceRepository: EvidenceRepository,
): Promise<AssessmentRunResult> {
  await evidenceRepository.saveEvidence(session, toEvidenceRow(session, submission));
  return runWorkspaceAssessment(session, context, workspaceRepository, evidenceRepository);
}
