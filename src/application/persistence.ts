export interface OrganizationRow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberRow {
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "COMPLIANCE" | "OPERATIONS" | "CLINICAL" | "FINANCE" | "VIEWER";
}

export interface AssessmentRow {
  id: string;
  organizationId: string;
  score: number;
  status: string;
  ruleVersion: string;
  payload: unknown;
  createdAt: string;
}

export interface EvidenceRow {
  id: string;
  organizationId: string;
  kind: string;
  payload: unknown;
  createdAt: string;
}

/**
 * Database-neutral contract.
 * A PostgreSQL adapter should implement this interface and enforce
 * organization scope on every query.
 */
export interface PersistenceRepository {
  getOrganization(id: string): Promise<OrganizationRow | undefined>;
  listMembers(organizationId: string): Promise<OrganizationMemberRow[]>;
  getAssessment(organizationId: string, assessmentId: string): Promise<AssessmentRow | undefined>;
  listAssessments(organizationId: string): Promise<AssessmentRow[]>;
  listEvidence(organizationId: string): Promise<EvidenceRow[]>;
}
