export type Jurisdiction = "MD" | "DC" | "AZ" | "US" | "FIFA";
export type RuleStatus = "CURRENT" | "PROPOSED" | "EFFECTIVE" | "GUIDANCE" | "RETIRED";
export type EvidenceState = "MISSING" | "PRESENT" | "STALE" | "CONFLICTING" | "HUMAN_REVIEW";

export interface RegulatorySource {
  id: string;
  authority: string;
  title: string;
  url: string;
  jurisdiction: Jurisdiction;
  status: RuleStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
  retrievedAt: string;
}

export interface RegulatoryRequirement {
  id: string;
  sourceId: string;
  citation: string;
  title: string;
  summary: string;
  appliesTo: {
    organizationTypes?: string[];
    services?: string[];
    sites?: string[];
    providerTypes?: string[];
  };
  requiredEvidence: string[];
  consequence?: string;
  humanReviewRequired: boolean;
}

export interface OrganizationNode {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  organizationType?: string;
}

export interface SiteNode {
  id: string;
  organizationId: string;
  name: string;
  address?: string;
  services: string[];
}

export interface ServiceNode {
  id: string;
  siteId: string;
  name: string;
  programCode?: string;
  licenseType?: string;
}

export interface ComplianceAssessment {
  requirementId: string;
  status: EvidenceState;
  score: number;
  reasons: string[];
  evaluatedAt: string;
}

export interface RegulatoryGraph {
  organization: OrganizationNode;
  sites: SiteNode[];
  services: ServiceNode[];
  requirements: RegulatoryRequirement[];
}

export function assessRequirement(
  requirement: RegulatoryRequirement,
  evidence: Record<string, EvidenceState>,
  now = new Date().toISOString()
): ComplianceAssessment {
  const states = requirement.requiredEvidence.map(key => evidence[key] ?? "MISSING");
  const present = states.filter(s => s === "PRESENT").length;
  const conflicting = states.filter(s => s === "CONFLICTING").length;
  const stale = states.filter(s => s === "STALE").length;

  let score = requirement.requiredEvidence.length === 0
    ? 100
    : Math.round((present / requirement.requiredEvidence.length) * 100);

  if (conflicting > 0) score = Math.min(score, 49);
  if (stale > 0) score = Math.min(score, 69);

  const reasons: string[] = [];
  if (present) reasons.push(`${present} required evidence item(s) present`);
  if (stale) reasons.push(`${stale} evidence item(s) stale`);
  if (conflicting) reasons.push(`${conflicting} evidence conflict(s) require review`);
  if (states.some(s => s === "MISSING")) reasons.push("One or more required evidence items are missing");
  if (requirement.humanReviewRequired) reasons.push("Requirement is designated for human review");

  return {
    requirementId: requirement.id,
    status: conflicting ? "CONFLICTING" : stale ? "STALE" : present === states.length ? "PRESENT" : "MISSING",
    score,
    reasons,
    evaluatedAt: now
  };
}
