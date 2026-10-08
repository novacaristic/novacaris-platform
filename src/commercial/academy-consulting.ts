export type AcademyProductType =
  | "FREE_INTELLIGENCE"
  | "COURSE"
  | "APPLIED_LAB"
  | "CERTIFICATE"
  | "ENTERPRISE_ACADEMY";

export type ConsultingServiceType =
  | "READINESS_ASSESSMENT"
  | "COMPLIANCE_TRANSFORMATION"
  | "AI_TRANSFORMATION"
  | "NOVACARIS_IMPLEMENTATION"
  | "FUNDING_INTELLIGENCE"
  | "GROWTH_STRATEGY";

export type EngagementStatus =
  | "LEAD"
  | "DISCOVERY"
  | "ASSESSMENT"
  | "IMPLEMENTATION"
  | "VERIFICATION"
  | "ADVISORY"
  | "COMPLETED";

export interface AcademyOffering {
  id: string;
  name: string;
  type: AcademyProductType;
  competencyAreas: string[];
  evidenceProduced: string[];
  active: boolean;
}

export interface ConsultingOffering {
  id: string;
  name: string;
  type: ConsultingServiceType;
  outcomes: string[];
  requiresHumanReview: boolean;
  active: boolean;
}

export interface ConsultingEngagement {
  id: string;
  organizationId: string;
  siteIds: string[];
  serviceIds: string[];
  offeringId: string;
  status: EngagementStatus;
  readinessScore?: number;
  evidenceIds: string[];
  trainingOfferingIds: string[];
  recommendedActions: string[];
}

export const ACADEMY_OFFERINGS: AcademyOffering[] = [
  {
    id: "academy-ai-without-fear",
    name: "AI Without Fear",
    type: "COURSE",
    competencyAreas: ["AI literacy", "responsible AI"],
    evidenceProduced: ["completion", "assessment"],
    active: true,
  },
  {
    id: "academy-compliance-readiness",
    name: "COMAR & Regulatory Readiness",
    type: "COURSE",
    competencyAreas: ["regulatory readiness", "evidence management"],
    evidenceProduced: ["completion", "assessment", "project"],
    active: true,
  },
  {
    id: "academy-mprime-lab",
    name: "MPRIME Readiness Lab",
    type: "APPLIED_LAB",
    competencyAreas: ["MPRIME readiness", "provider operations"],
    evidenceProduced: ["lab submission", "assessment"],
    active: true,
  },
  {
    id: "academy-ai-governance",
    name: "AI Governance for Behavioral Health",
    type: "CERTIFICATE",
    competencyAreas: ["AI governance", "agent safety", "human authorization"],
    evidenceProduced: ["coursework", "assessment", "portfolio"],
    active: true,
  },
];

export const CONSULTING_OFFERINGS: ConsultingOffering[] = [
  {
    id: "consulting-nova-readiness",
    name: "NOVA Readiness Check",
    type: "READINESS_ASSESSMENT",
    outcomes: ["readiness score", "evidence gaps", "prioritized actions"],
    requiresHumanReview: true,
    active: true,
  },
  {
    id: "consulting-compliance-transformation",
    name: "Regulatory & Compliance Transformation",
    type: "COMPLIANCE_TRANSFORMATION",
    outcomes: ["applicability map", "evidence plan", "corrective-action plan"],
    requiresHumanReview: true,
    active: true,
  },
  {
    id: "consulting-ai-transformation",
    name: "AI Transformation",
    type: "AI_TRANSFORMATION",
    outcomes: ["AI roadmap", "agent governance", "workflow redesign"],
    requiresHumanReview: true,
    active: true,
  },
  {
    id: "consulting-novacaris-implementation",
    name: "NovaCarïs Implementation",
    type: "NOVACARIS_IMPLEMENTATION",
    outcomes: ["configured workflows", "staff readiness", "verification"],
    requiresHumanReview: true,
    active: true,
  },
  {
    id: "consulting-funding-intelligence",
    name: "Funding Intelligence",
    type: "FUNDING_INTELLIGENCE",
    outcomes: ["opportunity pipeline", "eligibility gaps", "pursuit recommendations"],
    requiresHumanReview: true,
    active: true,
  },
];

export function academyOffering(id: string): AcademyOffering | undefined {
  return ACADEMY_OFFERINGS.find((offering) => offering.id === id);
}

export function consultingOffering(id: string): ConsultingOffering | undefined {
  return CONSULTING_OFFERINGS.find((offering) => offering.id === id);
}
