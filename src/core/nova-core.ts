import { assessMPRIME, type MPRIMEAssessment, type MPRIMEProviderProfile } from "../maryland/mprime.js";
import { assessRequirement, type ComplianceAssessment, type RegulatoryGraph, type RegulatoryRequirement } from "../domain/regulatory.js";
import type { AgentAction, Permission } from "../domain/agents.js";
import { AgentRegistry } from "../domain/registry.js";
import { EvidenceLedger } from "../domain/ledger.js";
import type { EvidenceRecord } from "../domain/evidence.js";
import { isEvidenceUsable } from "../domain/evidence.js";
import { scoreFundingOpportunity, type ApplicantProfile, type FundingOpportunity, type FundingScore } from "../funding/scoring.js";

export interface NOVARequest {
  requestId: string;
  agentId: string;
  permissionId?: string;
  subjectId: string;
  action: AgentAction;
  organizationId: string;
  siteId: string;
  serviceId: string;
  graph: RegulatoryGraph;
  evidence: EvidenceRecord[];
  evidenceStates: Record<string, import("../domain/regulatory.js").EvidenceState>;
  mprime?: MPRIMEProviderProfile;
  fundingOpportunities?: FundingOpportunity[];
  applicant?: ApplicantProfile;
}

export interface NOVAResult {
  requestId: string;
  readiness?: MPRIMEAssessment;
  compliance: ComplianceAssessment[];
  funding: FundingScore[];
  authorization: {
    allowed: boolean;
    requiresApproval: boolean;
    reason: string;
  };
  executed: boolean;
  ledgerEntryId?: string;
  nextActions: string[];
}

export class NOVACore {
  constructor(
    readonly registry: AgentRegistry,
    readonly ledger: EvidenceLedger
  ) {}

  run(request: NOVARequest, now = new Date()): NOVAResult {
    const compliance = request.graph.requirements.map((requirement: RegulatoryRequirement) =>
      assessRequirement(requirement, request.evidenceStates, now.toISOString())
    );

    const readiness = request.mprime ? assessMPRIME(request.mprime, now) : undefined;

    const usableEvidence = request.evidence.filter(item => isEvidenceUsable(item, now));
    const funding = request.fundingOpportunities && request.applicant
      ? request.fundingOpportunities.map(opportunity => scoreFundingOpportunity(opportunity, request.applicant!, now))
      : [];

    const authorization = request.permissionId
      ? this.registry.authorize(request.agentId, request.permissionId, request.action, now)
      : { allowed: false, requiresApproval: false, reason: "No permission supplied" };

    const nextActions = [
      ...compliance.flatMap(item => item.status !== "PRESENT" ? [`Resolve compliance requirement ${item.requirementId}`] : []),
      ...(readiness?.actions ?? []),
      ...(readiness?.blockers ?? []),
      ...funding.filter(item => item.recommendedAction === "PURSUE").map(item => `Review funding opportunity ${item.opportunityId}`)
    ];

    if (!authorization.allowed) {
      return { requestId: request.requestId, readiness, compliance, funding, authorization, executed: false, nextActions };
    }

    if (authorization.requiresApproval) {
      const auth = this.ledger.requestAuthorization({
        id: `auth:${request.requestId}`,
        agentId: request.agentId,
        action: request.action,
        subjectId: request.subjectId,
        evidenceIds: usableEvidence.map(item => item.id)
      }, now);
      nextActions.push(`Human authorization required: ${auth.id}`);
      return { requestId: request.requestId, readiness, compliance, funding, authorization, executed: false, nextActions };
    }

    const entry = this.ledger.recordExecution(
      request.agentId,
      request.subjectId,
      usableEvidence.map(item => item.id),
      { requestId: request.requestId, action: request.action, organizationId: request.organizationId, siteId: request.siteId, serviceId: request.serviceId },
      now
    );

    return { requestId: request.requestId, readiness, compliance, funding, authorization, executed: true, ledgerEntryId: entry.id, nextActions };
  }
}
