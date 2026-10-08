import type { ReadinessFinding, ReadinessIntake } from "./readiness.js";

export interface IntakeSite {
  id: string;
  name: string;
  jurisdiction: string;
  address?: string;
  licenseStatus?: "UNKNOWN" | "PENDING" | "ACTIVE" | "EXPIRED";
  evidenceIds: string[];
}

export interface IntakeService {
  id: string;
  siteId: string;
  name: string;
  category: string;
  payerPrograms: string[];
  evidenceIds: string[];
}

export interface ProviderIntake {
  intake: ReadinessIntake;
  sites: IntakeSite[];
  services: IntakeService[];
  evidenceIds: string[];
  submittedAt: string;
}

export interface IntakeValidation {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export interface IntakeAssessmentSeed {
  intake: ProviderIntake;
  findings: ReadinessFinding[];
}

export function validateProviderIntake(input: ProviderIntake): IntakeValidation {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!input.intake.organizationId) missing.push("organizationId");
  if (!input.intake.organizationName) missing.push("organizationName");
  if (!input.intake.organizationType) missing.push("organizationType");
  if (input.intake.jurisdictions.length === 0) missing.push("jurisdictions");
  if (input.sites.length === 0) missing.push("sites");
  if (input.services.length === 0) missing.push("services");

  const siteIds = new Set(input.sites.map((site) => site.id));
  for (const service of input.services) {
    if (!siteIds.has(service.siteId)) {
      missing.push(`service:${service.id}:siteId`);
    }
  }

  if (input.evidenceIds.length === 0) {
    warnings.push("No organization-level evidence has been supplied.");
  }

  if (input.sites.some((site) => !site.evidenceIds.length)) {
    warnings.push("One or more sites have no linked evidence.");
  }

  if (input.services.some((service) => !service.evidenceIds.length)) {
    warnings.push("One or more services have no linked evidence.");
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function seedReadinessFindings(input: ProviderIntake): ReadinessFinding[] {
  const findings: ReadinessFinding[] = [];

  if (!input.intake.organizationType) {
    findings.push({
      id: "finding-org-type",
      domain: "ORGANIZATION",
      priority: "HIGH",
      status: "RED",
      title: "Organization type is missing",
      description: "The organization type is required before reliable applicability analysis.",
      evidenceIds: [],
      recommendedActions: ["Confirm the legal/provider organization type."],
      humanReviewRequired: true,
    });
  } else {
    findings.push({
      id: "finding-org-identity",
      domain: "ORGANIZATION",
      priority: "LOW",
      status: input.evidenceIds.length ? "GREEN" : "AMBER",
      title: "Organization identity evidence",
      description: input.evidenceIds.length
        ? "Organization-level evidence has been supplied."
        : "Organization identity has been declared but evidence is not yet linked.",
      evidenceIds: input.evidenceIds,
      recommendedActions: input.evidenceIds.length
        ? []
        : ["Upload or link authoritative organization identity evidence."],
      humanReviewRequired: !input.evidenceIds.length,
    });
  }

  for (const site of input.sites) {
    const hasEvidence = site.evidenceIds.length > 0;
    const hasLicense = site.licenseStatus && site.licenseStatus !== "UNKNOWN";

    findings.push({
      id: `finding-site-${site.id}`,
      domain: "SITE",
      priority: hasEvidence && hasLicense ? "LOW" : "HIGH",
      status: hasEvidence && hasLicense ? "GREEN" : "AMBER",
      title: `Site readiness: ${site.name}`,
      description: hasEvidence
        ? "Site evidence is present; license status should still be verified against the applicable authority."
        : "Site has been declared but supporting evidence is incomplete.",
      evidenceIds: site.evidenceIds,
      recommendedActions: hasEvidence
        ? ["Verify current site/license status against the authoritative source."]
        : ["Provide site and license/authorization evidence."],
      humanReviewRequired: true,
    });
  }

  for (const service of input.services) {
    const hasEvidence = service.evidenceIds.length > 0;
    findings.push({
      id: `finding-service-${service.id}`,
      domain: "SERVICE",
      priority: hasEvidence ? "LOW" : "HIGH",
      status: hasEvidence ? "GREEN" : "AMBER",
      title: `Service readiness: ${service.name}`,
      description: hasEvidence
        ? "Service evidence is available for further applicability analysis."
        : "Service is declared without linked supporting evidence.",
      evidenceIds: service.evidenceIds,
      recommendedActions: hasEvidence
        ? ["Map the service to applicable regulatory requirements."]
        : ["Provide service authorization, program, payer, or operational evidence."],
      humanReviewRequired: true,
    });
  }

  const maryland = input.intake.jurisdictions.some(
    (jurisdiction) => jurisdiction.toUpperCase() === "MD" ||
      jurisdiction.toUpperCase() === "MARYLAND",
  );

  if (maryland) {
    findings.push({
      id: "finding-md-regulatory",
      domain: "REGULATORY",
      priority: "HIGH",
      status: "HUMAN_REVIEW",
      title: "Maryland regulatory applicability review",
      description: "Maryland requirements require source-backed organization/site/service applicability analysis.",
      evidenceIds: input.evidenceIds,
      recommendedActions: [
        "Run the Maryland regulatory graph against declared sites and services.",
        "Verify current source status before relying on a requirement.",
      ],
      humanReviewRequired: true,
    });

    findings.push({
      id: "finding-md-mprime",
      domain: "MPRIME",
      priority: "HIGH",
      status: "HUMAN_REVIEW",
      title: "MPRIME readiness assessment",
      description: "Maryland MPRIME readiness should be assessed from provider identity, sites, services, enrollment and evidence.",
      evidenceIds: input.evidenceIds,
      recommendedActions: [
        "Confirm provider/entity identity and enrollment state.",
        "Validate site/service evidence.",
        "Resolve missing or conflicting enrollment evidence.",
      ],
      humanReviewRequired: true,
    });
  }

  if (!input.intake.fundingObjective) {
    findings.push({
      id: "finding-funding-objective",
      domain: "FUNDING",
      priority: "LOW",
      status: "AMBER",
      title: "Funding objective not specified",
      description: "Funding intelligence is more useful when the organization identifies a funding objective.",
      evidenceIds: [],
      recommendedActions: ["Define the target funding need, amount, geography, and use of funds."],
      humanReviewRequired: false,
    });
  }

  if (!input.intake.technologyObjective) {
    findings.push({
      id: "finding-ai-objective",
      domain: "AI_GOVERNANCE",
      priority: "LOW",
      status: "AMBER",
      title: "Technology objective not specified",
      description: "AI/software recommendations should be grounded in a defined operational objective.",
      evidenceIds: [],
      recommendedActions: ["Identify the highest-priority workflow or technology problem."],
      humanReviewRequired: false,
    });
  }

  return findings;
}

export function prepareIntakeAssessment(input: ProviderIntake): IntakeAssessmentSeed {
  return {
    intake: input,
    findings: seedReadinessFindings(input),
  };
}
