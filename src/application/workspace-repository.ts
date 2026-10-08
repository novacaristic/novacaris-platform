import type { ReadinessAssessment } from "../commercial/readiness.js";
import type { ProviderIntake } from "../commercial/intake.js";
import type { SessionContext, WorkspaceRecord, AssessmentHistoryEntry } from "./workspace.js";

export interface WorkspaceRepository {
 getWorkspace(session: SessionContext): Promise<WorkspaceRecord | undefined>;
 saveWorkspace(session: SessionContext, workspace: WorkspaceRecord): Promise<void>;
 saveAssessment(session: SessionContext, assessment: ReadinessAssessment): Promise<AssessmentHistoryEntry>;
 listAssessments(session: SessionContext): Promise<AssessmentHistoryEntry[]>;
 getIntake(session: SessionContext): Promise<ProviderIntake | undefined>;
 saveIntake(session: SessionContext, intake: ProviderIntake): Promise<void>;
}

export class MemoryWorkspaceRepository implements WorkspaceRepository {
 private readonly workspaces = new Map<string, WorkspaceRecord>();
 private readonly assessments = new Map<string, AssessmentHistoryEntry[]>();
 private readonly intakes = new Map<string, ProviderIntake>();
 async getWorkspace(session: SessionContext) { return this.workspaces.get(session.organizationId); }
 async saveWorkspace(session: SessionContext, workspace: WorkspaceRecord) {
  if (workspace.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");
  this.workspaces.set(session.organizationId, workspace);
 }
 async saveAssessment(session: SessionContext, assessment: ReadinessAssessment) {
  if (assessment.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");
  const entry: AssessmentHistoryEntry = { assessmentId: assessment.id, organizationId: assessment.organizationId, score: assessment.overallScore, status: assessment.overallStatus, ruleVersion: assessment.ruleVersion, createdAt: assessment.createdAt };
  const history = this.assessments.get(session.organizationId) ?? []; history.push(entry); this.assessments.set(session.organizationId, history); return entry;
 }
 async listAssessments(session: SessionContext) { return [...(this.assessments.get(session.organizationId) ?? [])]; }
 async getIntake(session: SessionContext) { return this.intakes.get(session.organizationId); }
 async saveIntake(session: SessionContext, intake: ProviderIntake) {
  if (intake.intake.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");
  this.intakes.set(session.organizationId, intake);
 }
}