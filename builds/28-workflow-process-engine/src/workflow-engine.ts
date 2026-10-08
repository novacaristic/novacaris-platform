export type WorkflowStatus =
  | "pending"
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "canceled"
  | "failed";

export interface WorkflowStep {
  key: string;
  required: boolean;
  dependencies: string[];
  status: "pending" | "ready" | "running" | "waiting" | "complete" | "blocked" | "failed";
}

export interface WorkflowDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  authorize(stepKey: string): Promise<boolean>;
  execute(stepKey: string): Promise<{ success: boolean; result?: unknown; error?: string }>;
  createEscalation(stepKey: string, reason: string): Promise<void>;
}

export function getReadySteps(steps: WorkflowStep[]): WorkflowStep[] {
  const completed = new Set(
    steps.filter((step) => step.status === "complete").map((step) => step.key),
  );

  return steps.filter(
    (step) =>
      step.status === "pending" &&
      step.dependencies.every((dependency) => completed.has(dependency)),
  );
}

export async function executeStep(
  deps: WorkflowDependencies,
  step: WorkflowStep,
): Promise<{ status: "completed" | "blocked" | "failed" }> {
  const authorized = await deps.authorize(step.key);

  if (!authorized) {
    await deps.createEscalation(step.key, "AUTHORIZATION_REQUIRED");
    await deps.recordEvent("workflow.step.blocked", {
      stepKey: step.key,
      reason: "AUTHORIZATION_REQUIRED",
    });
    return { status: "blocked" };
  }

  const result = await deps.execute(step.key);

  if (!result.success) {
    await deps.createEscalation(
      step.key,
      result.error ?? "STEP_EXECUTION_FAILED",
    );
    await deps.recordEvent("workflow.step.failed", {
      stepKey: step.key,
      error: result.error,
    });
    return { status: "failed" };
  }

  await deps.recordEvent("workflow.step.completed", {
    stepKey: step.key,
  });

  return { status: "completed" };
}
