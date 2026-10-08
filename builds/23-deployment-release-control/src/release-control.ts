export type Environment = "development" | "staging" | "production";

export type ReleaseStatus =
  | "draft"
  | "validated"
  | "approved"
  | "deploying"
  | "deployed"
  | "failed"
  | "rolled_back";

export interface Release {
  id: string;
  version: string;
  sourceRevision: string;
  status: ReleaseStatus;
}

export interface ReleaseGate {
  key: string;
  passed: boolean;
  required: boolean;
}

export interface ReleaseDependencies {
  recordEvent(event: {
    type: string;
    releaseId: string;
    environment: Environment;
    details?: Record<string, unknown>;
  }): Promise<void>;
  verify(deploymentId: string): Promise<ReleaseGate[]>;
  approve(releaseId: string, environment: Environment): Promise<boolean>;
  deploy(releaseId: string, environment: Environment): Promise<string>;
  rollback(deploymentId: string): Promise<void>;
}

export async function promoteRelease(
  deps: ReleaseDependencies,
  release: Release,
  environment: Environment,
): Promise<{ deploymentId?: string; promoted: boolean }> {
  if (environment === "production" && release.status !== "approved") {
    return { promoted: false };
  }

  if (environment !== "development") {
    const approved = await deps.approve(release.id, environment);
    if (!approved) return { promoted: false };
  }

  await deps.recordEvent({
    type: "release.promotion.requested",
    releaseId: release.id,
    environment,
  });

  const deploymentId = await deps.deploy(release.id, environment);
  const gates = await deps.verify(deploymentId);

  const failedRequiredGate = gates.some(
    (gate) => gate.required && !gate.passed,
  );

  if (failedRequiredGate) {
    await deps.rollback(deploymentId);
    await deps.recordEvent({
      type: "release.rollback.completed",
      releaseId: release.id,
      environment,
      details: { deploymentId },
    });
    return { deploymentId, promoted: false };
  }

  await deps.recordEvent({
    type: "release.promotion.completed",
    releaseId: release.id,
    environment,
    details: { deploymentId },
  });

  return { deploymentId, promoted: true };
}
