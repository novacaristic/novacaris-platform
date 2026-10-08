export type EngagementStatus =
  | "discovery"
  | "scoping"
  | "proposal"
  | "active"
  | "on_hold"
  | "review"
  | "completed"
  | "canceled";

export interface EngagementDeliverable {
  key: string;
  required: boolean;
  status: "planned" | "in_progress" | "submitted" | "accepted" | "rejected";
}

export interface ConsultancyDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  verifyCommercialApproval(): Promise<boolean>;
  verifyRequiredDeliverables(): Promise<string[]>;
  closeEngagement(): Promise<void>;
}

export async function evaluateEngagementClosure(
  deps: ConsultancyDependencies,
  deliverables: EngagementDeliverable[],
): Promise<{ ready: boolean; blockers: string[] }> {
  const blockers = deliverables
    .filter((item) => item.required && item.status !== "accepted")
    .map((item) => `DELIVERABLE_NOT_ACCEPTED:${item.key}`);

  if (!(await deps.verifyCommercialApproval())) {
    blockers.push("COMMERCIAL_CLOSEOUT_NOT_APPROVED");
  }

  blockers.push(...(await deps.verifyRequiredDeliverables()));

  if (blockers.length > 0) {
    await deps.recordEvent("engagement.closure.blocked", { blockers });
    return { ready: false, blockers };
  }

  return { ready: true, blockers: [] };
}

export async function closeEngagement(
  deps: ConsultancyDependencies,
  deliverables: EngagementDeliverable[],
): Promise<void> {
  const result = await evaluateEngagementClosure(deps, deliverables);

  if (!result.ready) {
    throw new Error("ENGAGEMENT_NOT_READY_TO_CLOSE");
  }

  await deps.closeEngagement();
  await deps.recordEvent("engagement.closed", {});
}
