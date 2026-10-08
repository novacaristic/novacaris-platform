import { assessMPRIME, type MPRIMEProviderProfile } from "../maryland/mprime.js";
import { assessRequirement, type RegulatoryGraph } from "../domain/regulatory.js";
import { scoreFundingOpportunity, type ApplicantProfile, type FundingOpportunity } from "../funding/scoring.js";
import { isEvidenceUsable, type EvidenceRecord } from "../domain/evidence.js";
import { buildReadinessAssessment, type ReadinessAssessment, type ReadinessFinding } from "./readiness.js";
import { prepareIntakeAssessment, validateProviderIntake, type ProviderIntake } from "./intake.js";

export interface NOVAAssessmentInput {
  provider: ProviderIntake;
  regulatoryGraph: RegulatoryGraph;
  evidence: EvidenceRecord[];
  evidenceStates: Record<string, import("../domain/regulatory.js").EvidenceState>;
  mprime?: MPRIMEProviderProfile;
  fundingOpportunities?: FundingOpportunity[];
  applicant?: ApplicantProfile;
  now?: Date;
}

export interface NOVAAssessmentPackage {
  assessment: ReadinessAssessment;
  compliance: ReturnType<typeof assessRequirement>[];
  mprime?: ReturnType<typeof assessMPRIME>;
  funding: ReturnType<typeof scoreFundingOpportunity>[];
  usableEvidenceIds: string[];
  validation: ReturnType<typeof import("./intake.js").validateProviderIntake>;
}

function recommendationSet(
  assessment: ReadinessAssessment,
  funding: NOVAAssessmentPackage["funding"],
): ReadinessAssessment {
  const academy = new Set<string>();
  const consulting = new Set<string>();
  const software = new Set<string>();

  for (const finding of assessment.findings) {
    if (finding.domain === "REGULATORY" || finding.domain === "EVIDENCE") {
      academy.add("academy-compliance-readiness");
      consulting.add("consulting-compliance-transformation");
      software.add("NovaCompliance");
    }
    if (finding.domain === "MPRIME") {
      academy.add("academy-mprime-lab");
      consulting.add("consulting-nova-readiness");
    }
    if (finding.domain === "AI_GOVERNANCE") {
      academy.add("academy-ai-governance");
      academy.add("academy-ai-without-fear");
      consulting.add("consulting-ai-transformation");
      software.add("NOVA Trust Layer");
    }
    if (finding.domain === "FUNDING") {
      consulting.add("consulting-funding-intelligence");
      software.add("NovaGrant");
    }
    if (finding.domain === "SERVICE" || finding.domain === "OPERATIONS") {
      consulting.add("consulting-novacaris-implementation");
      software.add("NovaCarïs EHR");
      software.add("NovaClerk");
    }
  }

  if (funding.some(item => item.recommendedAction === "PURSUE")) {
    consulting.add("consulting-funding-intelligence");
    software.add("NovaGrant");
  }

  return {
    ...assessment,
    academyRecommendations: [...academy],
    consultingRecommendations: [...consulting],
    softwareRecommendations: [...software],
  };
}

export function runNOVAAssessment(input: NOVAAssessmentInput): NOVAAssessmentPackage {
  const now = input.now ?? new Date();
  const seeded = prepareIntakeAssessment(input.provider);

  const compliance = input.regulatoryGraph.requirements
    .map((requirement) => assessRequirement(requirement, input.evidenceStates, now.toISOString()));

  const usableEvidence = input.evidence.filter((item) => isEvidenceUsable(item, now));

  const mprime = input.mprime ? assessMPRIME(input.mprime, now) : undefined;

  const funding =
    input.fundingOpportunities && input.applicant
      ? input.fundingOpportunities.map((opportunity) =>
          scoreFundingOpportunity(opportunity, input.applicant!, now),
        )
      : [];

  const findings: ReadinessFinding[] = [...seeded.findings];

  for (const item of compliance) {
    const status =
      item.status === "PRESENT"
        ? "GREEN"
        : item.status === "CONFLICTING"
          ? "HUMAN_REVIEW"
          : item.status === "STALE"
            ? "AMBER"
            : "RED";

    findings.push({
      id: `compliance-${item.requirementId}`,
      domain: "REGULATORY",
      priority: item.status === "CONFLICTING" ? "CRITICAL" : item.status === "MISSING" ? "HIGH" : "MEDIUM",
      status,
      title: `Regulatory requirement: ${item.requirementId}`,
      description: item.reasons.join("; "),
      evidenceIds: input.regulatoryGraph.requirements
        .find((requirement) => requirement.id === item.requirementId)?.requiredEvidence
        .flatMap((key) => input.evidence.filter((e) => e.id === key).map((e) => e.id)) ?? [],
      recommendedActions: item.status === "PRESENT"
        ? ["Maintain evidence and re-verify when the applicable source or validity changes."]
        : [`Resolve requirement ${item.requirementId} before treating readiness as complete.`],
      humanReviewRequired:
        input.regulatoryGraph.requirements.find((requirement) => requirement.id === item.requirementId)
          ?.humanReviewRequired ?? false,
    });
  }

  if (mprime) {
    findings.push({
      id: "mprime-readiness",
      domain: "MPRIME",
      priority: mprime.readiness === "READY" ? "LOW" : "HIGH",
      status:
        mprime.readiness === "READY"
          ? "GREEN"
          : mprime.readiness === "HUMAN_REVIEW"
            ? "HUMAN_REVIEW"
            : "AMBER",
      title: "Maryland MPRIME readiness",
      description: `MPRIME readiness is ${mprime.readiness} with score ${mprime.score}.`,
      evidenceIds: usableEvidence.map((e) => e.id),
      recommendedActions: [...mprime.blockers, ...mprime.actions],
      humanReviewRequired: true,
    });
  }

  if (funding.length) {
    const best = funding.reduce((a, b) => (b.score > a.score ? b : a));
    findings.push({
      id: "funding-readiness",
      domain: "FUNDING",
      priority: best.fit === "INELIGIBLE" ? "HIGH" : "MEDIUM",
      status: best.fit === "INELIGIBLE" ? "RED" : best.score >= 70 ? "GREEN" : "AMBER",
      title: "Government opportunity fit",
      description: `Best current opportunity fit: ${best.fit} (${best.score}/100).`,
      evidenceIds: usableEvidence.map((e) => e.id),
      recommendedActions: best.gaps,
      humanReviewRequired: false,
    });
  }

  const assessment = recommendationSet(
    buildReadinessAssessment(input.provider.intake, findings),
    funding,
  );

  return {
    assessment,
    compliance,
    mprime,
    funding,
    usableEvidenceIds: usableEvidence.map((e) => e.id),
    validation: validateProviderIntake(input.provider),
  } as unknown as NOVAAssessmentPackage;
}
