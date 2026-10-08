export type ContinuityMode =
  | "normal"
  | "degraded"
  | "read_only"
  | "manual"
  | "emergency";

export interface RecoveryTarget {
  rtoSeconds: number;
  rpoSeconds: number;
}

export interface RecoveryObservation {
  restoreSeconds: number;
  dataAgeSeconds: number;
  verificationPassed: boolean;
}

export interface RecoveryDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  activateMode(mode: ContinuityMode): Promise<void>;
  reconcile(): Promise<{ complete: boolean; discrepancies: number }>;
}

export async function evaluateRecovery(
  deps: RecoveryDependencies,
  target: RecoveryTarget,
  observation: RecoveryObservation,
): Promise<{
  recoverable: boolean;
  rtoMet: boolean;
  rpoMet: boolean;
  reconciliationRequired: boolean;
}> {
  const rtoMet = observation.restoreSeconds <= target.rtoSeconds;
  const rpoMet = observation.dataAgeSeconds <= target.rpoSeconds;

  if (!observation.verificationPassed) {
    await deps.activateMode("emergency");
    await deps.recordEvent("recovery.verification.failed", {
      rtoMet,
      rpoMet,
    });
    return {
      recoverable: false,
      rtoMet,
      rpoMet,
      reconciliationRequired: true,
    };
  }

  if (!rtoMet || !rpoMet) {
    await deps.activateMode("degraded");
    await deps.recordEvent("recovery.target.missed", {
      rtoMet,
      rpoMet,
    });
  }

  const reconciliation = await deps.reconcile();

  return {
    recoverable: reconciliation.complete && observation.verificationPassed,
    rtoMet,
    rpoMet,
    reconciliationRequired: reconciliation.discrepancies > 0,
  };
}
