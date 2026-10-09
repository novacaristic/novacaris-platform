export type AdoptionStatus =
  | "discovered"
  | "mapped"
  | "adapter_ready"
  | "tested"
  | "pilot"
  | "adopted"
  | "retired"
  | "blocked";

export interface MigrationGate {
  status: AdoptionStatus;
  contractVersionPinned: boolean;
  adapterReviewed: boolean;
  compatibilityTestsPassed: boolean;
  regressionTestsPassed: boolean;
  tenantScopeVerified: boolean;
  authorizationBoundaryVerified: boolean;
  rollbackPlanPresent: boolean;
  evidenceReference?: string;
}

export function evaluateAdoptionGate(input: MigrationGate): {
  allowed: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!input.contractVersionPinned) blockers.push("CONTRACT_VERSION_NOT_PINNED");
  if (!input.adapterReviewed) blockers.push("ADAPTER_REVIEW_REQUIRED");
  if (!input.compatibilityTestsPassed) blockers.push("COMPATIBILITY_TESTS_NOT_PASSED");
  if (!input.regressionTestsPassed) blockers.push("REGRESSION_TESTS_NOT_PASSED");
  if (!input.tenantScopeVerified) blockers.push("TENANT_SCOPE_NOT_VERIFIED");
  if (!input.authorizationBoundaryVerified) blockers.push("AUTHORIZATION_BOUNDARY_NOT_VERIFIED");
  if (!input.rollbackPlanPresent) blockers.push("ROLLBACK_PLAN_REQUIRED");
  if (!input.evidenceReference) blockers.push("MIGRATION_EVIDENCE_REQUIRED");
  if (input.status === "blocked" || input.status === "discovered" || input.status === "mapped") {
    blockers.push("MIGRATION_NOT_READY");
  }
  return { allowed: blockers.length === 0, blockers };
}

export interface MigrationEventWriter {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
}

export async function recordMigrationDecision(
  writer: MigrationEventWriter,
  itemKey: string,
  decision: ReturnType<typeof evaluateAdoptionGate>,
): Promise<void> {
  await writer.recordEvent(
    decision.allowed ? "contract_migration.gate_passed" : "contract_migration.gate_blocked",
    { itemKey, blockers: decision.blockers },
  );
}
