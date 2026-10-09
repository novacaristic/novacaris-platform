export interface SmokeCheck {
  name: string;
  passed: boolean;
  status?: number;
  expectedStatus?: number;
  durationMs?: number;
  detail?: string;
}
export interface SmokeReport {
  schemaVersion: string;
  reportType: string;
  runId: string;
  startedAt: string;
  completedAt: string;
  baseUrlConfigured: boolean;
  result: "passed" | "failed";
  passedChecks: number;
  totalChecks: number;
  checks: SmokeCheck[];
  limitations: string[];
}
export interface ReleaseEvidenceInput {
  environment: string;
  commitSha: string;
  smokeReport: unknown;
  testRunUrl: string;
  reviewerActor: string;
  approvalReference?: string;
}
export interface ReleaseGateResult {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  report?: SmokeReport;
}
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const runIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function iso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function validateSmokeReport(value: unknown): { report?: SmokeReport; blockers: string[] } {
  const blockers: string[] = [];
  if (!isRecord(value)) return { blockers: ["SMOKE_REPORT_INVALID_SHAPE"] };
  const checks = value.checks;
  if (value.schemaVersion !== "1.0") blockers.push("SMOKE_REPORT_SCHEMA_UNSUPPORTED");
  if (value.reportType !== "nova-deployment-smoke") blockers.push("SMOKE_REPORT_TYPE_INVALID");
  if (typeof value.runId !== "string" || !runIdPattern.test(value.runId)) blockers.push("SMOKE_REPORT_RUN_ID_INVALID");
  if (!iso(value.startedAt) || !iso(value.completedAt) || (iso(value.startedAt) && iso(value.completedAt) && Date.parse(value.completedAt) < Date.parse(value.startedAt))) blockers.push("SMOKE_REPORT_TIMESTAMPS_INVALID");
  if (value.baseUrlConfigured !== true) blockers.push("SMOKE_REPORT_BASE_URL_MISSING");
  if (!Array.isArray(checks) || checks.length === 0 || !checks.every((item) => isRecord(item) && typeof item.name === "string" && item.name.length > 0 && typeof item.passed === "boolean")) {
    blockers.push("SMOKE_REPORT_CHECKS_INVALID");
  }
  const safeChecks = Array.isArray(checks) ? checks.filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.name === "string" && typeof item.passed === "boolean") : [];
  const computedPassed = safeChecks.filter(item => item.passed).length;
  if (value.passedChecks !== computedPassed || value.totalChecks !== safeChecks.length) blockers.push("SMOKE_REPORT_COUNTS_MISMATCH");
  if (value.result !== "passed" || safeChecks.some(item => item.passed !== true) || safeChecks.length === 0) blockers.push("SMOKE_REPORT_CHECKS_NOT_ALL_PASSED");
  if (!Array.isArray(value.limitations) || !value.limitations.every(item => typeof item === "string")) blockers.push("SMOKE_REPORT_LIMITATIONS_INVALID");
  if (blockers.length) return { blockers };
  return { blockers: [], report: value as unknown as SmokeReport };
}
export function evaluateReleaseGate(input: ReleaseEvidenceInput): ReleaseGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const environment = input.environment.trim();
  const commitSha = input.commitSha.trim();
  const reviewerActor = input.reviewerActor.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/.test(environment)) blockers.push("RELEASE_ENVIRONMENT_INVALID");
  if (!shaPattern.test(commitSha)) blockers.push("RELEASE_COMMIT_SHA_INVALID");
  if (!/^https:\/\/(github\.com|gitlab\.com)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/(actions\/runs|-/)[a-zA-Z0-9_./-]+$/.test(input.testRunUrl)) blockers.push("RELEASE_TEST_RUN_URL_INVALID");
  if (!reviewerActor || reviewerActor.length > 200) blockers.push("RELEASE_HUMAN_REVIEWER_REQUIRED");
  if (!input.approvalReference?.trim()) blockers.push("RELEASE_APPROVAL_REFERENCE_REQUIRED");
  const validated = validateSmokeReport(input.smokeReport);
  blockers.push(...validated.blockers);
  if (validated.report && validated.report.limitations.length === 0) warnings.push("SMOKE_REPORT_LIMITATIONS_NOT_DOCUMENTED");
  if (blockers.length) return { eligible: false, blockers, warnings };
  return { eligible: true, blockers: [], warnings, report: validated.report };
}
