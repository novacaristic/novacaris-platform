export type WorkspaceRole = "OWNER" | "ADMIN" | "COMPLIANCE" | "OPERATIONS" | "CLINICAL" | "FINANCE" | "VIEWER";

export interface SessionContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  roles: WorkspaceRole[];
  authenticatedAt: string;
}

export interface WorkspaceRecord {
  organizationId: string;
  organizationName: string;
  createdAt: string;
  updatedAt: string;
  assessmentIds: string[];
  latestAssessmentId?: string;
}

export interface AssessmentHistoryEntry {
  assessmentId: string;
  organizationId: string;
  score: number;
  status: string;
  ruleVersion: string;
  createdAt: string;
}

export function canReadWorkspace(session: SessionContext, organizationId: string): boolean {
  return session.organizationId === organizationId;
}

export function canManageWorkspace(session: SessionContext): boolean {
  return session.roles.includes("OWNER") || session.roles.includes("ADMIN");
}