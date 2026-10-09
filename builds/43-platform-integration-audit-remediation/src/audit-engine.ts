export type EvidenceStatus = "specified" | "committed" | "static_reviewed" | "tested" | "integrated" | "staging_verified" | "production_verified";

export interface BuildAuditRecord {
  buildKey: string;
  status: EvidenceStatus;
  evidenceReference?: string;
  sourceRevision?: string;
  environment?: string;
  result?: "passed" | "failed";
}

export interface AuditFinding {
  key: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "accepted_risk";
}

const rank: Record<EvidenceStatus, number> = {
  specified: 1, committed: 2, static_reviewed: 3, tested: 4,
  integrated: 5, staging_verified: 6, production_verified: 7,
};

export function validateEvidenceStatus(record: BuildAuditRecord) {
  const blockers: string[] = [];
  if (rank[record.status] >= rank.tested) {
    if (!record.evidenceReference) blockers.push("TEST_OR_RUNTIME_EVIDENCE_REQUIRED");
    if (!record.sourceRevision) blockers.push("SOURCE_REVISION_REQUIRED");
    if (!record.environment) blockers.push("ENVIRONMENT_REQUIRED");
    if (record.result !== "passed") blockers.push("PASS_RESULT_REQUIRED");
  }
  if (record.status === "staging_verified" && record.environment !== "staging") blockers.push("STAGING_ENVIRONMENT_REQUIRED");
  if (record.status === "production_verified" && record.environment !== "production") blockers.push("PRODUCTION_ENVIRONMENT_REQUIRED");
  return { valid: blockers.length === 0, blockers };
}

export function summarizeAudit(records: BuildAuditRecord[], findings: AuditFinding[]) {
  const unverifiedBuilds = records
    .filter((record) => rank[record.status] < rank.tested || !validateEvidenceStatus(record).valid)
    .map((record) => record.buildKey);
  const openCriticalFindings = findings.filter(
    (finding) => finding.severity === "critical" && finding.status !== "resolved",
  ).length;
  return {
    totalBuilds: records.length,
    evidencedTestedOrHigher: records.length - unverifiedBuilds.length,
    unverifiedBuilds,
    openCriticalFindings,
    releaseBlocked: openCriticalFindings > 0 || unverifiedBuilds.length > 0,
  };
}
