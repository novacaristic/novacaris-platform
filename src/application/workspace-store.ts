import type { ReadinessAssessment } from "../commercial/readiness.js";
import type { SessionContext, WorkspaceRecord, AssessmentHistoryEntry } from "./workspace.js";
export interface WorkspaceStore { get(id: string): WorkspaceRecord | undefined; save(workspace: WorkspaceRecord): void; appendAssessment(session: SessionContext, assessment: ReadinessAssessment): AssessmentHistoryEntry; history(session: SessionContext): AssessmentHistoryEntry[]; }
export class InMemoryWorkspaceStore implements WorkspaceStore {
 private readonly workspaces = new Map<string, WorkspaceRecord>();
 private readonly assessments = new Map<string, AssessmentHistoryEntry[]>();
 get(id: string) { return this.workspaces.get(id); }
 save(workspace: WorkspaceRecord) { this.workspaces.set(workspace.organizationId, { ...workspace, updatedAt: new Date().toISOString() }); }
 appendAssessment(session: SessionContext, assessment: ReadinessAssessment) {
  if (session.organizationId !== assessment.organizationId) throw new Error("Organization scope mismatch.");
  const entry: AssessmentHistoryEntry = { assessmentId: assessment.id, organizationId: assessment.organizationId, score: assessment.overallScore, status: assessment.overallStatus, ruleVersion: assessment.ruleVersion, createdAt: assessment.createdAt };
  const history = this.assessments.get(session.organizationId) ?? []; history.push(entry); this.assessments.set(session.organizationId, history); return entry;
 }
 history(session: SessionContext) { return [...(this.assessments.get(session.organizationId) ?? [])]; }
}