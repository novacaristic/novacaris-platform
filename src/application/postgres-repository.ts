import type { ReadinessAssessment } from "../commercial/readiness.js";
import type { ProviderIntake } from "../commercial/intake.js";
import type { SessionContext } from "./workspace.js";
import type { WorkspaceRepository } from "./workspace-repository.js";
import type { EvidenceRepository } from "./evidence-service.js";
import type { EvidenceRow, PersistenceRepository, AssessmentRow, ActionRow, AuthorizationRequestRow, LedgerEntryRow } from "./persistence.js";
import { withOrganizationScope, type OrganizationScopedDatabase } from "./postgres-context.js";

interface WorkspaceQueryRow { organization_id:string; organization_name:string; created_at:string; updated_at:string; latest_assessment_id:string|null; }
interface AssessmentQueryRow { id:string; organization_id:string; score:number; status:string; rule_version:string; created_at:string; }
interface IntakeQueryRow { payload:unknown; }

export class PostgresPersistenceRepository implements PersistenceRepository {
  constructor(private readonly db: OrganizationScopedDatabase) {}
  async getOrganization(id:string) {
    const rows=await withOrganizationScope(this.db,id,()=>this.db.query<{id:string;name:string;created_at:string;updated_at:string}>(
      "SELECT id,name,created_at,updated_at FROM organizations WHERE id=$1",[id]));
    const row=rows[0]; return row ? {id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at}:undefined;
  }
  async listMembers(organizationId:string) {
    return withOrganizationScope(this.db,organizationId,async()=>{
      const rows=await this.db.query<{organization_id:string;user_id:string;role:PersistenceRepository extends never?never:string}>(
        "SELECT organization_id,user_id,role FROM organization_members WHERE organization_id=$1",[organizationId]));
      return rows.map(row=>({organizationId:row.organization_id,userId:row.user_id,role:row.role as any}));
    });
  }
  async getAssessment(organizationId:string,assessmentId:string) {
    const rows=await withOrganizationScope(this.db,organizationId,()=>this.db.query<AssessmentRow>(
      "SELECT id,organization_id AS \"organizationId\",score,status,rule_version AS \"ruleVersion\",payload,created_at AS \"createdAt\" FROM assessments WHERE organization_id=$1 AND id=$2",[organizationId,assessmentId]));
    return rows[0];
  }
  async listAssessments(organizationId:string) {
    return withOrganizationScope(this.db,organizationId,()=>this.db.query<AssessmentRow>(
      "SELECT id,organization_id AS \"organizationId\",score,status,rule_version AS \"ruleVersion\",payload,created_at AS \"createdAt\" FROM assessments WHERE organization_id=$1 ORDER BY created_at DESC",[organizationId]));
  }
  async listEvidence(organizationId:string) {
    return withOrganizationScope(this.db,organizationId,()=>this.db.query<EvidenceRow>(
      "SELECT id,organization_id AS \"organizationId\",kind,payload,created_at AS \"createdAt\" FROM evidence_records WHERE organization_id=$1 ORDER BY created_at DESC",[organizationId]));
  }
  async listActions(organizationId:string) {
    return withOrganizationScope(this.db,organizationId,()=>this.db.query<ActionRow>(
      "SELECT id,organization_id AS \"organizationId\",source_finding_id AS \"sourceFindingId\",title,owner_role AS \"ownerRole\",due_at AS \"dueAt\",status,requires_human_authorization AS \"requiresHumanAuthorization\",evidence_ids AS \"evidenceIds\",verification_note AS \"verificationNote\",created_at AS \"createdAt\",updated_at AS \"updatedAt\",completed_at AS \"completedAt\" FROM actions WHERE organization_id=$1 ORDER BY created_at DESC",[organizationId]));
  }
  async listAuthorizationRequests(organizationId:string) {
    return withOrganizationScope(this.db,organizationId,()=>this.db.query<AuthorizationRequestRow>(
      "SELECT id,organization_id AS \"organizationId\",agent_id AS \"agentId\",action,subject_id AS \"subjectId\",evidence_ids AS \"evidenceIds\",requested_at AS \"requestedAt\",status,decided_at AS \"decidedAt\",approver_id AS \"approverId\",rationale FROM authorization_requests WHERE organization_id=$1 ORDER BY requested_at DESC",[organizationId]));
  }
  async saveAuthorizationRequest(organizationId:string,row:AuthorizationRequestRow):Promise<void> {
    if(row.organizationId!==organizationId) throw new Error("Organization scope mismatch.");
    await withOrganizationScope(this.db,organizationId,()=>this.db.query(
      "INSERT INTO authorization_requests (id,organization_id,agent_id,action,subject_id,evidence_ids,requested_at,status,decided_at,approver_id,rationale) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING",
      [row.id,row.organizationId,row.agentId,row.action,row.subjectId,row.evidenceIds,row.requestedAt,row.status,row.decidedAt??null,row.approverId??null,row.rationale??null]));
  }
  async decideAuthorization(organizationId:string,id:string,status:"APPROVED"|"REJECTED",approverId:string,rationale:string,decidedAt:string) {
    const rows=await withOrganizationScope(this.db,organizationId,()=>this.db.query<AuthorizationRequestRow>(
      "UPDATE authorization_requests SET status=$1,decided_at=$2,approver_id=$3,rationale=$4 WHERE id=$5 AND organization_id=$6 AND status='PENDING' RETURNING id,organization_id AS \"organizationId\",agent_id AS \"agentId\",action,subject_id AS \"subjectId\",evidence_ids AS \"evidenceIds\",requested_at AS \"requestedAt\",status,decided_at AS \"decidedAt\",approver_id AS \"approverId\",rationale",
      [status,decidedAt,approverId,rationale,id,organizationId]));
    const row=rows[0]; if(!row) throw new Error("Authorization request not found or already decided.");
    return row;
  }
  async listLedgerEntries(organizationId:string) {
    return withOrganizationScope(this.db,organizationId,()=>this.db.query<LedgerEntryRow>(
      "SELECT id,organization_id AS \"organizationId\",event_type AS \"eventType\",actor_id AS \"actorId\",timestamp,subject_id AS \"subjectId\",evidence_ids AS \"evidenceIds\",metadata FROM evidence_ledger_entries WHERE organization_id=$1 ORDER BY timestamp DESC",[organizationId]));
  }
  async appendLedgerEntry(organizationId:string,row:LedgerEntryRow):Promise<void> {
    if(row.organizationId!==organizationId) throw new Error("Organization scope mismatch.");
    await withOrganizationScope(this.db,organizationId,()=>this.db.query(
      "INSERT INTO evidence_ledger_entries (id,organization_id,event_type,actor_id,timestamp,subject_id,evidence_ids,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [row.id,row.organizationId,row.eventType,row.actorId,row.timestamp,row.subjectId,row.evidenceIds,row.metadata]));
  }
}

export class PostgresEvidenceRepository implements EvidenceRepository {
  constructor(private readonly db:OrganizationScopedDatabase){}
  async saveEvidence(session:SessionContext,row:EvidenceRow):Promise<void>{
    if(row.organizationId!==session.organizationId) throw new Error("Organization scope mismatch.");
    await withOrganizationScope(this.db,session.organizationId,()=>this.db.query(
      "INSERT INTO evidence_records (id,organization_id,kind,payload,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,payload=EXCLUDED.payload",
      [row.id,row.organizationId,row.kind,row.payload,row.createdAt]));
  }
  async listEvidence(session:SessionContext){ return new PostgresPersistenceRepository(this.db).listEvidence(session.organizationId); }
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db:OrganizationScopedDatabase){}
  async getWorkspace(session:SessionContext){
    const rows=await withOrganizationScope(this.db,session.organizationId,()=>this.db.query<WorkspaceQueryRow>(
      "SELECT w.organization_id,w.organization_id AS organization_name,w.created_at,w.updated_at,w.latest_assessment_id FROM workspaces w WHERE w.organization_id=$1",[session.organizationId]));
    const row=rows[0]; if(!row)return undefined;
    return {organizationId:row.organization_id,organizationName:row.organization_name,createdAt:row.created_at,updatedAt:row.updated_at,assessmentIds:[],...(row.latest_assessment_id?{latestAssessmentId:row.latest_assessment_id}:{})};
  }
  async saveWorkspace(session:SessionContext,workspace:any){
    if(workspace.organizationId!==session.organizationId)throw new Error("Organization scope mismatch.");
    await withOrganizationScope(this.db,session.organizationId,()=>this.db.query(
      "INSERT INTO workspaces (organization_id,latest_assessment_id,created_at,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id) DO UPDATE SET latest_assessment_id=EXCLUDED.latest_assessment_id,updated_at=EXCLUDED.updated_at",
      [workspace.organizationId,workspace.latestAssessmentId??null,workspace.createdAt,workspace.updatedAt]));
  }
  async saveAssessment(session:SessionContext,assessment:ReadinessAssessment){
    if(assessment.organizationId!==session.organizationId)throw new Error("Organization scope mismatch.");
    await withOrganizationScope(this.db,session.organizationId,()=>this.db.query(
      "INSERT INTO assessments (id,organization_id,score,status,rule_version,payload,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [assessment.id,assessment.organizationId,assessment.overallScore,assessment.overallStatus,assessment.ruleVersion,assessment,assessment.createdAt]));
    return {assessmentId:assessment.id,organizationId:assessment.organizationId,score:assessment.overallScore,status:assessment.overallStatus,ruleVersion:assessment.ruleVersion,createdAt:assessment.createdAt};
  }
  async listAssessments(session:SessionContext){
    const rows=await new PostgresPersistenceRepository(this.db).listAssessments(session.organizationId);
    return rows.map(row=>({assessmentId:row.id,organizationId:row.organizationId,score:row.score,status:row.status,ruleVersion:row.ruleVersion,createdAt:row.createdAt}));
  }
  async getIntake(session:SessionContext){
    const rows=await withOrganizationScope(this.db,session.organizationId,()=>this.db.query<IntakeQueryRow>(
      "SELECT payload FROM provider_intakes WHERE organization_id=$1",[session.organizationId]));
    return rows[0]?.payload as ProviderIntake|undefined;
  }
  async saveIntake(session:SessionContext,intake:ProviderIntake){
    if(intake.intake.organizationId!==session.organizationId)throw new Error("Organization scope mismatch.");
    await withOrganizationScope(this.db,session.organizationId,()=>this.db.query(
      "INSERT INTO provider_intakes (organization_id,payload,submitted_at) VALUES ($1,$2,$3) ON CONFLICT (organization_id) DO UPDATE SET payload=EXCLUDED.payload,submitted_at=EXCLUDED.submitted_at",
      [session.organizationId,intake,new Date().toISOString()]));
  }
}
