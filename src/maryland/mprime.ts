import type { EvidenceState } from "../domain/regulatory.js";

export type MPRIMEReadiness = "READY" | "ACTION_REQUIRED" | "RISK" | "HUMAN_REVIEW";

export interface MPRIMEProviderProfile {
  providerId: string;
  npi: string;
  providerType: string;
  entityName: string;
  sites: string[];
  services: string[];
  enrolledInMarylandMedicaid: boolean;
  mprimeAccountAssociated: boolean;
  revalidationDue?: string;
  revalidationComplete?: boolean;
  enrollmentApplicationStatus:
    | "NOT_STARTED" | "SUBMITTED" | "UNDER_REVIEW" | "ENROLLED" | "RETURNED" | "UNKNOWN";
  requiredEvidence: Record<
    "identity" | "license" | "ownership" | "site" | "service" | "revalidation",
    EvidenceState
  >;
  courtesyAuthorizationNeeded?: boolean;
}

export interface MPRIMEAssessment {
  readiness: MPRIMEReadiness;
  score: number;
  blockers: string[];
  actions: string[];
  checkedAt: string;
  ruleVersion: string;
}

const RULE_VERSION = "MD-MPRIME-2026-10";

export function assessMPRIME(profile: MPRIMEProviderProfile, now = new Date()): MPRIMEAssessment {
  const blockers: string[] = [];
  const actions: string[] = [];

  if (!profile.npi) blockers.push("NPI is missing");
  if (!profile.entityName) blockers.push("Entity name is missing");
  if (!profile.mprimeAccountAssociated)
    actions.push("Associate authorized users with the MPRIME provider account");

  if (profile.enrollmentApplicationStatus === "RETURNED")
    blockers.push("MPRIME enrollment application was returned");

  if (profile.enrollmentApplicationStatus === "UNKNOWN")
    blockers.push("MPRIME enrollment status cannot be verified");

  for (const [key, state] of Object.entries(profile.requiredEvidence)) {
    if (state === "MISSING") actions.push(`Provide missing ${key} evidence`);
    if (state === "STALE") actions.push(`Refresh stale ${key} evidence`);
    if (state === "CONFLICTING") blockers.push(`${key} evidence conflicts across sources`);
  }

  if (profile.revalidationDue && new Date(profile.revalidationDue) <= now && !profile.revalidationComplete)
    blockers.push("Revalidation is due or overdue");

  if (profile.enrollmentApplicationStatus !== "ENROLLED" && profile.courtesyAuthorizationNeeded)
    actions.push("Review Maryland Medicaid's temporary courtesy-authorization process for applicable behavioral-health providers");

  const states = Object.values(profile.requiredEvidence);
  const present = states.filter(s => s === "PRESENT").length;
  const score = Math.round((present / states.length) * 100);

  if (blockers.some(b => b.includes("conflicts") || b.includes("cannot be verified")))
    return { readiness: "HUMAN_REVIEW", score: Math.min(score, 49), blockers, actions, checkedAt: now.toISOString(), ruleVersion: RULE_VERSION };

  if (blockers.length > 0)
    return { readiness: "RISK", score: Math.min(score, 59), blockers, actions, checkedAt: now.toISOString(), ruleVersion: RULE_VERSION };

  if (profile.enrollmentApplicationStatus !== "ENROLLED" || actions.length > 0)
    return { readiness: "ACTION_REQUIRED", score, blockers, actions, checkedAt: now.toISOString(), ruleVersion: RULE_VERSION };

  return { readiness: "READY", score: 100, blockers, actions, checkedAt: now.toISOString(), ruleVersion: RULE_VERSION };
}
