import type {
  WorkspaceAuditEvent, WorkspaceNote, WorkspaceStore,
} from "../../61-nova-client-case-workspace/src/client-case-workspace";

interface QueryResult<Row> { rows: Row[]; rowCount: number | null; }
interface SqlClient { query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>; release(): void; }
interface SqlPool { connect(): Promise<SqlClient>; query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>; }
interface NoteRow {
  id: string; tenant_id: string; case_id: string; author_reference: string; source: WorkspaceNote["source"];
  content: WorkspaceNote["content"]; status: WorkspaceNote["status"]; version: number;
  compliance_blockers: string[]; reviewer_reference: string | null; review_note: string | null;
  created_at: Date | string; updated_at: Date | string;
}
function iso(v: Date | string): string { return v instanceof Date ? v.toISOString() : new Date(v).toISOString(); }
function mapNote(r: NoteRow): WorkspaceNote {
  return { id:r.id, tenantId:r.tenant_id, caseId:r.case_id, authorReference:r.author_reference, source:r.source,
    content:r.content, status:r.status, version:Number(r.version), complianceBlockers:r.compliance_blockers ?? [],
    ...(r.reviewer_reference ? {reviewerReference:r.reviewer_reference}:{}),
    ...(r.review_note ? {reviewNote:r.review_note}:{}), createdAt:iso(r.created_at), updatedAt:iso(r.updated_at) };
}
const SELECT_NOTE = `SELECT id, tenant_id, case_id, author_reference, source, content, status, version,
  compliance_blockers, reviewer_reference, review_note, created_at, updated_at FROM nova_workspace_notes`;
export class PostgresWorkspaceStore implements WorkspaceStore {
  constructor(private readonly pool: SqlPool) {}
  async getCase(tenantId: string, caseId: string) {
    const r = await this.pool.query<{id:string;tenant_id:string;status:"active"|"closed"}>(
      "SELECT id, tenant_id, status FROM nova_workspace_cases WHERE tenant_id=$1::uuid AND id=$2::uuid", [tenantId,caseId]);
    const row=r.rows[0]; return row ? {id:row.id,tenantId:row.tenant_id,status:row.status}:null;
  }
  async getNote(tenantId: string, noteId: string): Promise<WorkspaceNote|null> {
    const r=await this.pool.query<NoteRow>(`${SELECT_NOTE} WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,noteId]);
    return r.rows[0] ? mapNote(r.rows[0]):null;
  }
  async saveNote(note: WorkspaceNote): Promise<void> {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.writeNote(client,note);
      await client.query("COMMIT");
    } catch(e) { try { await client.query("ROLLBACK"); } catch {} throw e; }
    finally { client.release(); }
  }
  async appendAudit(event: WorkspaceAuditEvent): Promise<void> {
    await this.pool.query(`INSERT INTO nova_workspace_audit
      (event_id,tenant_id,note_id,actor_reference,action,occurred_at,authorization_decision_reference,details)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::timestamptz,$7,$8::jsonb)`,
      [event.eventId,event.tenantId,event.noteId,event.actorReference,event.action,event.occurredAt,event.authorizationDecisionReference,JSON.stringify(event.details)]);
  }
  async persistNoteAndAudit(note: WorkspaceNote, event: WorkspaceAuditEvent): Promise<void> {
    if (note.tenantId !== event.tenantId || note.id !== event.noteId) throw new Error("WORKSPACE_AUDIT_SCOPE_MISMATCH");
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.writeNote(client,note);
      await client.query(`INSERT INTO nova_workspace_audit
        (event_id,tenant_id,note_id,actor_reference,action,occurred_at,authorization_decision_reference,details)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::timestamptz,$7,$8::jsonb)`,
        [event.eventId,event.tenantId,event.noteId,event.actorReference,event.action,event.occurredAt,event.authorizationDecisionReference,JSON.stringify(event.details)]);
      await client.query("COMMIT");
    } catch(e) { try { await client.query("ROLLBACK"); } catch {} throw e; }
    finally { client.release(); }
  }
  private async writeNote(client: SqlClient,n: WorkspaceNote): Promise<void> {
    const values=[n.id,n.tenantId,n.caseId,n.authorReference,n.source,JSON.stringify(n.content),n.status,n.version,
      JSON.stringify(n.complianceBlockers),n.reviewerReference ?? null,n.reviewNote ?? null,n.createdAt,n.updatedAt];
    if(n.version===1) {
      const r=await client.query(`INSERT INTO nova_workspace_notes
        (id,tenant_id,case_id,author_reference,source,content,status,version,compliance_blockers,reviewer_reference,review_note,created_at,updated_at)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12::timestamptz,$13::timestamptz)
        ON CONFLICT (tenant_id,id) DO NOTHING RETURNING id`,values);
      if(r.rowCount!==1) throw new Error("WORKSPACE_VERSION_CONFLICT");
      return;
    }
    const r=await client.query(`UPDATE nova_workspace_notes SET
      content=$4::jsonb,status=$5,version=$6,compliance_blockers=$7::jsonb,reviewer_reference=$8,review_note=$9,updated_at=$10::timestamptz
      WHERE tenant_id=$1::uuid AND id=$2::uuid AND version=$3`,
      [n.tenantId,n.id,n.version-1,JSON.stringify(n.content),n.status,n.version,JSON.stringify(n.complianceBlockers),n.reviewerReference ?? null,n.reviewNote ?? null,n.updatedAt]);
    if(r.rowCount!==1) throw new Error("WORKSPACE_VERSION_CONFLICT");
  }
  async listAudit(tenantId: string,noteId: string): Promise<WorkspaceAuditEvent[]> {
    const r=await this.pool.query<{event_id:string;tenant_id:string;note_id:string;actor_reference:string;action:WorkspaceAuditEvent["action"];occurred_at:Date|string;authorization_decision_reference:string;details:WorkspaceAuditEvent["details"]}>(
      `SELECT event_id,tenant_id,note_id,actor_reference,action,occurred_at,authorization_decision_reference,details
       FROM nova_workspace_audit WHERE tenant_id=$1::uuid AND note_id=$2::uuid ORDER BY occurred_at,event_id`,[tenantId,noteId]);
    return r.rows.map(x=>({eventId:x.event_id,tenantId:x.tenant_id,noteId:x.note_id,actorReference:x.actor_reference,
      action:x.action,occurredAt:iso(x.occurred_at),authorizationDecisionReference:x.authorization_decision_reference,details:x.details}));
  }
}
