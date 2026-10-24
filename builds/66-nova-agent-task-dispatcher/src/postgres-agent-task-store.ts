import type { AgentTask, AgentTaskStore, AgentTaskStatus } from "./agent-task-dispatcher.js";

interface SqlResult<Row> { rows: Row[]; rowCount: number | null; }
interface SqlClient { query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlResult<Row>>; release(): void; }
interface SqlPool { query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlResult<Row>>; connect(): Promise<SqlClient>; }
interface TaskRow {
  tenant_id:string; task_id:string; agent_id:string; created_by:string; task_type:string; capability:string;
  input:Record<string,unknown>|string; status:AgentTaskStatus; idempotency_key:string; request_fingerprint:string;
  created_at:Date|string; started_at:Date|string|null; finished_at:Date|string|null; result:Record<string,unknown>|string|null;
  error_code:string|null; attempt_count:number|string;
}
const iso=(v:Date|string|null|undefined)=>v ? (v instanceof Date?v:new Date(v)).toISOString() : undefined;
function mapRow(r:TaskRow):AgentTask {
  const input=typeof r.input==="string"?JSON.parse(r.input):r.input;
  const result=typeof r.result==="string"?JSON.parse(r.result):r.result;
  return {
    id:r.task_id,tenantId:r.tenant_id,agentId:r.agent_id,createdBy:r.created_by,taskType:r.task_type,
    capability:r.capability as AgentTask["capability"],input,status:r.status,idempotencyKey:r.idempotency_key,
    requestFingerprint:r.request_fingerprint,createdAt:iso(r.created_at)!,attemptCount:Number(r.attempt_count),
    ...(iso(r.started_at)?{startedAt:iso(r.started_at)}:{}),...(iso(r.finished_at)?{finishedAt:iso(r.finished_at)}:{}),
    ...(result?{result}:{}),...(r.error_code?{errorCode:r.error_code}:{})
  };
}
const SELECT = "SELECT tenant_id,task_id,agent_id,created_by,task_type,capability,input,status,idempotency_key,request_fingerprint,created_at,started_at,finished_at,result,error_code,attempt_count FROM nova_agents.tasks";
export class PostgresAgentTaskStore implements AgentTaskStore {
  constructor(private readonly pool:SqlPool) {}
  async findByIdempotency(tenantId:string,agentId:string,key:string) {
    const r=await this.pool.query<TaskRow>(SELECT+" WHERE tenant_id=$1 AND agent_id=$2 AND idempotency_key=$3",[tenantId,agentId,key]);
    return r.rows[0]?mapRow(r.rows[0]):undefined;
  }
  async create(task:AgentTask):Promise<void> {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO nova_agents.tasks
         (tenant_id,task_id,agent_id,created_by,task_type,capability,input,status,idempotency_key,request_fingerprint,
          created_at,started_at,finished_at,result,error_code,attempt_count)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::timestamptz,$12::timestamptz,$13::timestamptz,$14::jsonb,$15,$16)`,
        [task.tenantId,task.id,task.agentId,task.createdBy,task.taskType,task.capability,JSON.stringify(task.input),task.status,task.idempotencyKey,task.requestFingerprint,task.createdAt,task.startedAt??null,task.finishedAt??null,task.result?JSON.stringify(task.result):null,task.errorCode??null,task.attemptCount]
      );
      await client.query(
        `INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,occurred_at,details)
         VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb)`,
        [task.tenantId,"event_"+crypto.randomUUID(),task.createdBy,task.agentId,task.status==="WAITING_APPROVAL"?"AGENT_TASK_WAITING_APPROVAL":"AGENT_TASK_QUEUED",task.createdAt,JSON.stringify({taskId:task.id,taskType:task.taskType,capability:task.capability})]
      );
      await client.query("COMMIT");
    } catch(e) {
      try { await client.query("ROLLBACK"); } catch {}
      if (typeof e==="object" && e!==null && "code" in e && (e as {code?:string}).code==="23505") throw new Error("TASK_IDEMPOTENCY_CONFLICT");
      throw e;
    } finally { client.release(); }
  }
  async claim(workerId:string,limit:number,leaseSeconds:number):Promise<AgentTask[]> {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r=await client.query<TaskRow>(
        `WITH candidates AS (
           SELECT tenant_id,task_id FROM nova_agents.tasks
            WHERE status='QUEUED' OR (status='RUNNING' AND lease_until<=now())
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
         )
         UPDATE nova_agents.tasks t SET status='RUNNING',lease_owner=$2,
           lease_until=now()+($3::int*interval '1 second'),attempt_count=t.attempt_count+1,
           started_at=COALESCE(t.started_at,now()),updated_at=now()
          FROM candidates c WHERE t.tenant_id=c.tenant_id AND t.task_id=c.task_id
         RETURNING t.tenant_id,t.task_id,t.agent_id,t.created_by,t.task_type,t.capability,t.input,t.status,
           t.idempotency_key,t.request_fingerprint,t.created_at,t.started_at,t.finished_at,t.result,t.error_code,t.attempt_count`,
        [limit,workerId,leaseSeconds]
      );
      await client.query("COMMIT");
      return r.rows.map(mapRow);
    } catch(e) { try { await client.query("ROLLBACK"); } catch {} throw e; }
    finally { client.release(); }
  }
  async finish(task:AgentTask,workerId:string):Promise<void> {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r=await client.query(
        `UPDATE nova_agents.tasks SET status='SUCCEEDED',result=$4::jsonb,error_code=NULL,finished_at=$5::timestamptz,
          updated_at=now(),lease_owner=NULL,lease_until=NULL
         WHERE tenant_id=$1 AND task_id=$2 AND status='RUNNING' AND lease_owner=$3`,
        [task.tenantId,task.id,workerId,JSON.stringify(task.result??{}),task.finishedAt??new Date().toISOString()]
      );
      if(r.rowCount!==1) throw new Error("TASK_LEASE_LOST");
      await client.query(
        `INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,occurred_at,details)
         VALUES($1,$2,$3,$4,'AGENT_TASK_SUCCEEDED',now(),$5::jsonb)`,
        [task.tenantId,"event_"+crypto.randomUUID(),workerId,task.agentId,JSON.stringify({taskId:task.id})]
      );
      await client.query("COMMIT");
    } catch(e) { try { await client.query("ROLLBACK"); } catch {} throw e; }
    finally { client.release(); }
  }
  async fail(taskId:string,tenantId:string,workerId:string,errorCode:string,retryable:boolean,maxAttempts:number):Promise<void> {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r=await client.query<{agent_id:string;status:AgentTaskStatus}>(
        `UPDATE nova_agents.tasks SET status=CASE WHEN $4 AND attempt_count<$5 THEN 'QUEUED' ELSE 'FAILED' END,
          error_code=$6,updated_at=now(),lease_owner=NULL,lease_until=NULL,
          finished_at=CASE WHEN $4 AND attempt_count<$5 THEN NULL ELSE now() END
         WHERE tenant_id=$1 AND task_id=$2 AND status='RUNNING' AND lease_owner=$3
         RETURNING agent_id,status`,
        [tenantId,taskId,workerId,retryable,maxAttempts,errorCode.slice(0,200)]
      );
      if(r.rowCount!==1||!r.rows[0]) throw new Error("TASK_LEASE_LOST");
      await client.query(
        `INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,occurred_at,details)
         VALUES($1,$2,$3,$4,$5,now(),$6::jsonb)`,
        [tenantId,"event_"+crypto.randomUUID(),workerId,r.rows[0].agent_id,r.rows[0].status==="FAILED"?"AGENT_TASK_FAILED":"AGENT_TASK_RETRY_SCHEDULED",JSON.stringify({taskId,errorCode:errorCode.slice(0,200)})]
      );
      await client.query("COMMIT");
    } catch(e) { try { await client.query("ROLLBACK"); } catch {} throw e; }
    finally { client.release(); }
  }
  async get(tenantId:string,taskId:string) {
    const r=await this.pool.query<TaskRow>(SELECT+" WHERE tenant_id=$1 AND task_id=$2",[tenantId,taskId]);
    return r.rows[0]?mapRow(r.rows[0]):undefined;
  }
}
