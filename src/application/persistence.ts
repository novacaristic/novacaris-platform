export type WorkspaceRole = "OWNER" | "ADMIN" | "COMPLIANCE" | "OPERATIONS" | "CLINICAL" | "FINANCE" | "VIEWER";
export interface OrganizationRow { id: string; name: string; createdAt: string; updatedAt: string; }
export interface OrganizationMemberRow { organizationId: string; userId: string; role: WorkspaceRole; }
export interface AssessmentRow { id: string; organizationId: string; score: number; status: string; ruleVersion: string; payload: unknown; createdAt: string; }
export interface EvidenceRow { id: string; organizationId: string; kind: string; payload: unknown; createdAt: string; }
export interface ActionRow { id:string; organizationId:string; sourceFindingId:string; title:string; ownerRole?:WorkspaceRole; dueAt?:string; status:"OPEN"|"IN_REVIEW"|"BLOCKED"|"COMPLETED"|"VERIFICATION_REQUIRED"; requiresHumanAuthorization:boolean; evidenceIds:string[]; verificationNote?:string; createdAt:string; updatedAt:string; completedAt?:string; }
export interface AuthorizationRequestRow { id:string; organizationId:string; agentId:string; action:string; subjectId:string; evidenceIds:string[]; requestedAt:string; status:"PENDING"|"APPROVED"|"REJECTED"|"EXPIRED"; decidedAt?:string; approverId?:string; rationale?:string; }
export interface LedgerEntryRow { id:string; organizationId:string; eventType:string; actorId:string; timestamp:string; subjectId:string; evidenceIds:string[]; metadata:Record<string,string>; }
export interface PersistenceRepository {
 getOrganization(id:string):Promise<OrganizationRow|undefined>; listMembers(organizationId:string):Promise<OrganizationMemberRow[]>;
 getAssessment(organizationId:string,assessmentId:string):Promise<AssessmentRow|undefined>; listAssessments(organizationId:string):Promise<AssessmentRow[]>;
 listEvidence(organizationId:string):Promise<EvidenceRow[]>; listActions(organizationId:string):Promise<ActionRow[]>;
 listAuthorizationRequests(organizationId:string):Promise<AuthorizationRequestRow[]>; saveAuthorizationRequest(organizationId:string,row:AuthorizationRequestRow):Promise<void>; decideAuthorization(organizationId:string,id:string,status:"APPROVED"|"REJECTED",approverId:string,rationale:string,decidedAt:string):Promise<AuthorizationRequestRow>; listLedgerEntries(organizationId:string):Promise<LedgerEntryRow[]>; appendLedgerEntry(organizationId:string,row:LedgerEntryRow):Promise<void>;
}
