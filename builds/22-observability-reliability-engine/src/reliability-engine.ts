export interface HealthSample {
  componentId: string;
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  latencyMs?: number;
  errorRate?: number;
}

export interface ReliabilityDependencies {
  recordHealth(sample: HealthSample): Promise<void>;
  openIncident(componentId: string, severity: string, reason: string): Promise<string>;
  emitAlert(componentId: string, severity: string, reason: string): Promise<void>;
}

export async function evaluateHealth(
  deps: ReliabilityDependencies,
  sample: HealthSample,
): Promise<{ status: HealthSample["status"]; incidentId?: string }> {
  await deps.recordHealth(sample);

  if (sample.status === "unavailable") {
    const incidentId = await deps.openIncident(
      sample.componentId,
      "critical",
      "Component unavailable",
    );

    await deps.emitAlert(
      sample.componentId,
      "critical",
      "Component unavailable",
    );

    return { status: sample.status, incidentId };
  }

  if (sample.status === "degraded") {
    await deps.emitAlert(
      sample.componentId,
      "high",
      "Component degraded",
    );
  }

  return { status: sample.status };
}
