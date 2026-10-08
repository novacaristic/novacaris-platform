import type { ReadinessAssessment, ReadinessFinding } from "../commercial/readiness.js";
import type { SessionContext } from "./workspace.js";

export type ActionStatus = "OPEN" | "IN_REVIEW" | "BLOCKED" | "COMPLETED" | "VERIFICATION_REQUIRED";
export interface ActionRecord {
  id: string; organizationId: string; sourceFindingId: string; title: string;
  ownerRole?: string; dueAt?: string; status: ActionStatus;
  requiresHumanAuthorization: boolean; evidenceIds: string[];
  createdAt: string; updatedAt: string; completedAt?: string; verificationNote?: string;
}
export interface ActionRepository {
  listActions(session: SessionContext): Promise<ActionRecord[]>;
  saveAction(session: SessionContext, action: ActionRecord): Promise<void>;
}
export class MemoryActionRepository implements ActionRepository {
  private readonly actions = new Map<string, ActionRecord[]>();
  async listActions(session: SessionContext) { return [...(this.actions.get(session.organizationId) ?? [])]; }
  async saveAction(session: SessionContext, action: ActionRecord) {
    if (action.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");
    const current = this.actions.get(session.organizationId) ?? [];
    const index = current.findIndex((item) => item.id === action.id);
    if (index >= 0) current[index] = action; else current.push(action);
    this.actions.set(session.organizationId, current);
  }
}
function actionId(findingId: string, index: number) { return \`action-\${findingId}-\${index + 1}\`; }
export function actionsFromAssessment(session: SessionContext, assessment: ReadinessAssessment, now = new Date()): ActionRecord[] {
  return assessment.findings.flatMap((finding) => finding.recommendedActions.map((title, index) => ({
    id: actionId(finding.id, index), organizationId: session.organizationId, sourceFindingId: finding.id,
    title, status: "OPEN" as const, requiresHumanAuthorization: finding.humanReviewRequired,
    evidenceIds: [...finding.evidenceIds], createdAt: now.toISOString(), updatedAt: now.toISOString(),
  })));
}
export async function syncActionsFromAssessment(session: SessionContext, assessment: ReadinessAssessment, repository: ActionRepository) {
  const existing = await repository.listActions(session);
  const existingIds = new Set(existing.map((item) => item.id));
  for (const action of actionsFromAssessment(session, assessment)) {
    if (!existingIds.has(action.id)) await repository.saveAction(session, action);
  }
  return repository.listActions(session);
}
export function updateAction(
  session: SessionContext, action: ActionRecord,
  patch: Pick<ActionRecord, "status" | "ownerRole" | "dueAt" | "evidenceIds" | "verificationNote">,
  now = new Date(),
): ActionRecord {
  if (action.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");
  if (patch.status === "COMPLETED" && action.requiresHumanAuthorization)
    throw new Error("Human authorization is required before this action can be completed.");
  const updated = { ...action, ...patch, updatedAt: now.toISOString() };
  if (patch.status === "COMPLETED") updated.completedAt = now.toISOString();
  return updated;
}
export function findingToActionSource(finding: ReadinessFinding) { return \`\${finding.domain} · \${finding.title}\`; }
