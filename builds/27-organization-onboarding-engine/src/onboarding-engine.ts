export type OnboardingStatus =
  | "started"
  | "in_progress"
  | "blocked"
  | "ready_for_activation"
  | "active"
  | "canceled";

export interface OnboardingStage {
  key: string;
  required: boolean;
  status: "pending" | "in_progress" | "complete" | "blocked";
}

export interface OnboardingDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  evaluateReadiness(): Promise<{
    ready: boolean;
    blockers: string[];
  }>;
  activateTenant(): Promise<void>;
}

export async function evaluateActivation(
  deps: OnboardingDependencies,
  stages: OnboardingStage[],
): Promise<{ ready: boolean; blockers: string[] }> {
  const incompleteRequired = stages
    .filter((stage) => stage.required && stage.status !== "complete")
    .map((stage) => stage.key);

  const readiness = await deps.evaluateReadiness();

  const blockers = [...incompleteRequired, ...readiness.blockers];

  if (blockers.length > 0 || !readiness.ready) {
    await deps.recordEvent("onboarding.activation.blocked", {
      blockers,
    });

    return { ready: false, blockers };
  }

  await deps.recordEvent("onboarding.ready_for_activation", {});
  return { ready: true, blockers: [] };
}

export async function activateOnboarding(
  deps: OnboardingDependencies,
  stages: OnboardingStage[],
): Promise<void> {
  const result = await evaluateActivation(deps, stages);

  if (!result.ready) {
    throw new Error("ONBOARDING_NOT_READY_FOR_ACTIVATION");
  }

  await deps.activateTenant();

  await deps.recordEvent("onboarding.activated", {});
}
