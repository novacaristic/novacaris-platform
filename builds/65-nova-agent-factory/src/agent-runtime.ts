import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts.js";
import type { AgentCapability, AgentRecord } from "./agent-factory.js";
import type { AgentFactory } from "./agent-factory.js";
import { decideAgentCapability, type PermissionGrant } from "./permission-policy.js";

export interface RuntimeRequest { method:string; path:string; body?:unknown; headers?:Record<string,string|undefined>; }
export interface RuntimeResponse { status:number; body:unknown; }
interface QueryResult<T=Record<string,unknown>> { rows:T[]; rowCount:number|null; }
interface Client { query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<QueryResult<T>>; release():void; }
interface Pool { query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<QueryResult<T>>; connect():Promise<Client>; }
type Resolver=(request:RuntimeRequest)=>Promise<RequestContext|null>;
type Authorizer=(context:RequestContext,action:string)=>Promise<boolean>;
export interface AgentTaskInput { tenantId:string; agentId:string; taskId:string; createdBy:string; capability:AgentCapability; input:Record<string,unknown>; idempotencyKey:string; }
export interface AgentTaskExecutor { execute(input:{agent:AgentRecord;capability:AgentCapability;input:Record<string,unknown>;signal:AbortSignal;invokeTool:<T>(toolName:string,requiredCapability:AgentCapability,operation:()=>Promise<T>)=>Promise<T>}):Promise<unknown>; }
const HUMAN_APPROVAL_CAPABILITIES=new Set<AgentCapability>(["crm.write","marketing.publish","finance.payment.prepare","operations.execute","evidence.write","agent.create"]);
const CAPABILITIES=new Set<AgentCapability>(["crm.read","crm.draft","crm.write","marketing.research","marketing.draft","marketing.publish","finance.analyze","finance.forecast","finance.payment.prepare","research.web","research.documents","research.due_diligence","operations.plan","operations.execute","compliance.assess","evidence.read","evidence.write","funding.discover","security.assess","agent.create"]);
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("REQUEST_BODY_INVALID");return v as Record<string,unknown>;}
function str(v:unknown,k:string,max=2000):string{if(typeof v!=="string"||!v.trim()||v.length>max)throw new Error("FIELD_INVALID:"+k);return v.trim();}
function safeError(e:unknown):RuntimeResponse{const code=e instanceof Error?e.message:"INTERNAL_ERROR";const status=/FORBIDDEN|DENIED|APPROVAL|PERMISSION|TENANT/.test(code)?403:/NOT_FOUND/.test(code)?404:/CONFLICT|EXISTS/.test(code)?409:/INVALID|REQUIRED|CAPABILITY/.test(code)?400:500;return{status,body:{error:code}};}
function id(prefix:string):string{return prefix+"_"+crypto.randomUUID();}

/** Persistence-backed permissions and task execution boundary. No provider adapter means no execution. */
export class PostgresAgentRuntime {
 constructor(private readonly pool:Pool,private readonly factory:AgentFactory){}
 async grant(input:{tenantId:string;agentId:string;capability:AgentCapability;actorId:string;expiresAt?:string;now?:Date}):Promise<PermissionGrant>{
  const agent=await this.factory.getAgent(input.tenantId,input.agentId);
  if(!agent)throw new Error("AGENT_NOT_FOUND");
  if(!agent.profile.capabilities.includes(input.capability))throw new Error("CAPABILITY_NOT_IN_AGENT_PROFILE");
  const now=input.now??new Date();
  if(input.expiresAt&&(!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=now.getTime()))throw new Error("PERMISSION_EXPIRY_INVALID");
  const permissionId=id("perm");
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   await client.query(`INSERT INTO nova_agents.agent_permissions(tenant_id,permission_id,agent_id,resource,actions,scopes,decision,requires_human_approval,granted_by,expires_at)
    VALUES($1,$2,$3,$4,'["invoke"]'::jsonb,'[]'::jsonb,'ALLOW',false,$5,$6::timestamptz)`,
    [input.tenantId,permissionId,input.agentId,input.capability,input.actorId,input.expiresAt??null]);
   await client.query(`UPDATE nova_agents.tasks SET status='QUEUED',error_code=NULL,finished_at=NULL
    WHERE tenant_id=$1 AND agent_id=$2 AND task_type=$3 AND status='WAITING_APPROVAL'
      AND error_code IN ('EXPLICIT_PERMISSION_GRANT_REQUIRED','PERMISSION_GRANT_EXPIRED')`,
    [input.tenantId,input.agentId,input.capability]);
   await client.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,occurred_at,details)
    VALUES($1,$2,$3,$4,'AGENT_PERMISSION_GRANTED',$5::timestamptz,$6::jsonb)`,
    [input.tenantId,id("event"),input.actorId,input.agentId,now.toISOString(),JSON.stringify({permissionId,capability:input.capability,expiresAt:input.expiresAt??null})]);
   await client.query("COMMIT");
  }catch(e){try{await client.query("ROLLBACK")}catch{}throw e;}finally{client.release();}
  return{tenantId:input.tenantId,agentId:input.agentId,capability:input.capability,grantedBy:input.actorId,allowed:true,requiresHumanApproval:false,...(input.expiresAt?{expiresAt:input.expiresAt}:{})};
 }
 async revoke(input:{tenantId:string;agentId:string;capability:AgentCapability;actorId:string}):Promise<void>{
  const c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   const result=await c.query(`UPDATE nova_agents.agent_permissions SET decision='DENY',requires_human_approval=false
    WHERE tenant_id=$1 AND agent_id=$2 AND resource=$3 AND decision='ALLOW'`,[input.tenantId,input.agentId,input.capability]);
   if(!result.rowCount)throw new Error("PERMISSION_GRANT_NOT_FOUND");
   await c.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,details)
    VALUES($1,$2,$3,$4,'AGENT_PERMISSION_REVOKED',$5::jsonb)`,[input.tenantId,id("event"),input.actorId,input.agentId,JSON.stringify({capability:input.capability})]);
   await c.query("COMMIT");
  }catch(e){try{await c.query("ROLLBACK")}catch{}throw e;}finally{c.release();}
 }
 async authorize(tenantId:string,agent:AgentRecord,capability:AgentCapability,now=new Date()):Promise<{allowed:boolean;reason:string}>{
  const result=await this.pool.query<{permission_id:string;resource:string;decision:string;requires_human_approval:boolean;granted_by:string;expires_at:Date|string|null}>(
   `SELECT permission_id,resource,decision,requires_human_approval,granted_by,expires_at FROM nova_agents.agent_permissions
    WHERE tenant_id=$1 AND agent_id=$2 AND resource=$3 ORDER BY (decision='ALLOW') DESC,created_at DESC,permission_id DESC LIMIT 1`,[tenantId,agent.id,capability]);
  const row=result.rows[0];
  if(!row)return{allowed:false,reason:"EXPLICIT_PERMISSION_GRANT_REQUIRED"};
  const grant:PermissionGrant={tenantId,agentId:agent.id,capability,grantedBy:row.granted_by,allowed:row.decision==="ALLOW",requiresHumanApproval:row.requires_human_approval,...(row.expires_at?{expiresAt:new Date(row.expires_at).toISOString()}:{})};
  const decision=decideAgentCapability({principal:{tenantId,subject:"runtime",role:"owner",capabilities:["agent.permission.grant"]},agent,capability,grant,now});
  return{allowed:decision.allowed,reason:decision.reason};
 }
 async enqueue(input:AgentTaskInput):Promise<{taskId:string;status:string}>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   const prior=await client.query<{task_id:string;status:string;created_by:string;agent_id:string;task_type:string}>(`SELECT task_id,status,created_by,agent_id,task_type FROM nova_agents.tasks WHERE tenant_id=$1 AND idempotency_key=$2`,[input.tenantId,input.idempotencyKey]);
   if(prior.rows[0]){const p=prior.rows[0];if(p.created_by!==input.createdBy||p.agent_id!==input.agentId||p.task_type!==input.capability)throw new Error("TASK_IDEMPOTENCY_CONFLICT");await client.query("COMMIT");return{taskId:p.task_id,status:p.status};}
   const agent=await this.factory.getAgent(input.tenantId,input.agentId);
   if(!agent)throw new Error("AGENT_NOT_FOUND");
   if(agent.lifecycle!=="ACTIVE")throw new Error("AGENT_NOT_ACTIVE");
   if(!agent.profile.capabilities.includes(input.capability))throw new Error("CAPABILITY_NOT_IN_AGENT_PROFILE");
   const grant=await this.authorize(input.tenantId,agent,input.capability);
   if(!grant.allowed)throw new Error(grant.reason);
   const taskStatus=HUMAN_APPROVAL_CAPABILITIES.has(input.capability)?"WAITING_APPROVAL":"QUEUED";
   const inserted=await client.query<{task_id:string;status:string}>(`INSERT INTO nova_agents.tasks(tenant_id,task_id,agent_id,created_by,task_type,input,status,idempotency_key,error_code)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$8,$7,$9)
    ON CONFLICT (tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING task_id,status`,[input.tenantId,input.taskId,input.agentId,input.createdBy,input.capability,JSON.stringify(input.input),input.idempotencyKey,taskStatus,taskStatus==="WAITING_APPROVAL"?"HUMAN_APPROVAL_REQUIRED":null]);
   if(!inserted.rows[0]){
    const duplicate=await client.query<{task_id:string;status:string;created_by:string;agent_id:string;task_type:string}>(`SELECT task_id,status,created_by,agent_id,task_type FROM nova_agents.tasks WHERE tenant_id=$1 AND idempotency_key=$2`,[input.tenantId,input.idempotencyKey]);
    if(!duplicate.rows[0])throw new Error("TASK_IDEMPOTENCY_CONFLICT");
    const p=duplicate.rows[0];if(p.created_by!==input.createdBy||p.agent_id!==input.agentId||p.task_type!==input.capability)throw new Error("TASK_IDEMPOTENCY_CONFLICT");
    await client.query("COMMIT");return{taskId:p.task_id,status:p.status};
   }
   await client.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,details)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[input.tenantId,id("event"),input.createdBy,input.agentId,taskStatus==="WAITING_APPROVAL"?"AGENT_TASK_APPROVAL_REQUIRED":"AGENT_TASK_QUEUED",JSON.stringify({taskId:input.taskId,capability:input.capability})]);
   await client.query("COMMIT");return{taskId:input.taskId,status:taskStatus};
  }catch(e){try{await client.query("ROLLBACK")}catch{}throw e;}finally{client.release();}
 }
 async approveTask(input:{tenantId:string;taskId:string;actorId:string}):Promise<void>{
  const c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   const found=await c.query<{created_by:string;status:string;error_code:string|null}>(`SELECT created_by,status,error_code FROM nova_agents.tasks WHERE tenant_id=$1 AND task_id=$2 FOR UPDATE`,[input.tenantId,input.taskId]);
   const task=found.rows[0];if(!task)throw new Error("TASK_NOT_FOUND");
   if(task.created_by===input.actorId)throw new Error("TASK_SELF_APPROVAL_DENIED");
   if(task.status!=="WAITING_APPROVAL"||task.error_code!=="HUMAN_APPROVAL_REQUIRED")throw new Error("TASK_NOT_AWAITING_APPROVAL");
   await c.query(`UPDATE nova_agents.tasks SET status='QUEUED',approved_by=$3,error_code=NULL,finished_at=NULL WHERE tenant_id=$1 AND task_id=$2`,[input.tenantId,input.taskId,input.actorId]);
   await c.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,details)
    SELECT tenant_id,$3,$4,agent_id,'AGENT_TASK_APPROVED',$5::jsonb FROM nova_agents.tasks WHERE tenant_id=$1 AND task_id=$2`,
    [input.tenantId,input.taskId,id("event"),input.actorId,JSON.stringify({taskId:input.taskId})]);
   await c.query("COMMIT");
  }catch(e){try{await c.query("ROLLBACK")}catch{}throw e;}finally{c.release();}
 }
 async getTask(tenantId:string,taskId:string):Promise<Record<string,unknown>|undefined>{
  const r=await this.pool.query<Record<string,unknown>>(`SELECT task_id,agent_id,task_type,status,result,error_code,created_at,started_at,finished_at FROM nova_agents.tasks WHERE tenant_id=$1 AND task_id=$2`,[tenantId,taskId]);
  return r.rows[0];
 }
 async runOne(executor?:AgentTaskExecutor,timeoutMs=60000):Promise<boolean>{
  if(!executor)return false;
  const c=await this.pool.connect();let task:{tenant_id:string;task_id:string;agent_id:string;created_by:string;approved_by:string|null;task_type:AgentCapability;input:Record<string,unknown>}|undefined;
  try{
   await c.query("BEGIN");
   const r=await c.query<typeof task extends infer T ? NonNullable<T> : never>(`SELECT tenant_id,task_id,agent_id,created_by,approved_by,task_type,input FROM nova_agents.tasks WHERE status='QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
   task=r.rows[0] as typeof task;
   if(!task){await c.query("COMMIT");return false;}
   await c.query("UPDATE nova_agents.tasks SET status='RUNNING',started_at=now() WHERE tenant_id=$1 AND task_id=$2",[task.tenant_id,task.task_id]);
   await c.query("COMMIT");
  }catch(e){try{await c.query("ROLLBACK")}catch{}throw e;}finally{c.release();}
  if(!task)return false;
  if(HUMAN_APPROVAL_CAPABILITIES.has(task.task_type)&&(!task.approved_by||task.approved_by===task.created_by)){await this.finish(task,"WAITING_APPROVAL",null,"HUMAN_APPROVAL_REQUIRED");return true;}
  const agent=await this.factory.getAgent(task.tenant_id,task.agent_id);
  if(!agent||agent.lifecycle!=="ACTIVE"){await this.finish(task,"FAILED",null,"AGENT_NOT_ACTIVE");return true;}
  const authorization=await this.authorize(task.tenant_id,agent,task.task_type);
  if(!authorization.allowed){await this.finish(task,"WAITING_APPROVAL",null,authorization.reason);return true;}
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  const invokeTool=async <T>(toolName:string,requiredCapability:AgentCapability,operation:()=>Promise<T>):Promise<T>=>{
   if(typeof toolName!=="string"||! /^[a-zA-Z0-9._:-]{1,120}$/.test(toolName))throw new Error("TOOL_NAME_INVALID");
   if(controller.signal.aborted)throw new Error("TASK_TIMEOUT");
   const latest=await this.factory.getAgent(task!.tenant_id,task!.agent_id);
   if(!latest||latest.lifecycle!=="ACTIVE")throw new Error("AGENT_NOT_ACTIVE");
   if(!CAPABILITIES.has(requiredCapability)||!latest.profile.capabilities.includes(requiredCapability))throw new Error("CAPABILITY_NOT_IN_AGENT_PROFILE");
   if(HUMAN_APPROVAL_CAPABILITIES.has(requiredCapability)&&(!task!.approved_by||task!.approved_by===task!.created_by))throw new Error("HUMAN_APPROVAL_REQUIRED");
   const gate=await this.authorize(task!.tenant_id,latest,requiredCapability);
   if(!gate.allowed)throw new Error(gate.reason);
   // Write the intent audit before the side effect. Audit failure means the tool is never called.
   await this.writeToolAudit(task!,toolName,requiredCapability,"AGENT_TOOL_CALL_STARTED");
   try{
    const value=await operation();
    await this.writeToolAudit(task!,toolName,requiredCapability,"AGENT_TOOL_CALL_SUCCEEDED");
    return value;
   }catch(error){
    try{await this.writeToolAudit(task!,toolName,requiredCapability,"AGENT_TOOL_CALL_FAILED");}catch{}
    throw error;
   }
  };
  const timeoutFailure=new Promise<never>((_,reject)=>controller.signal.addEventListener("abort",()=>reject(new Error("TASK_TIMEOUT")),{once:true}));
  try{const result=await Promise.race([executor.execute({agent,capability:task.task_type,input:task.input,signal:controller.signal,invokeTool}),timeoutFailure]);await this.finish(task,"SUCCEEDED",result,null);}
  catch(e){await this.finish(task,"FAILED",null,controller.signal.aborted?"TASK_TIMEOUT":"EXECUTOR_FAILED");}
  finally{clearTimeout(timeout);}
  return true;
 }
 private async writeToolAudit(task:{tenant_id:string;task_id:string;agent_id:string;created_by:string},toolName:string,capability:AgentCapability,eventType:string):Promise<void>{
  await this.pool.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,details)
   VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[task.tenant_id,id("event"),task.created_by,task.agent_id,eventType,JSON.stringify({taskId:task.task_id,toolName,capability})]);
 }
 private async finish(task:{tenant_id:string;task_id:string;agent_id:string;created_by:string},status:string,result:unknown,errorCode:string|null):Promise<void>{
  const c=await this.pool.connect();
  try{await c.query("BEGIN");await c.query(`UPDATE nova_agents.tasks SET status=$3,result=$4::jsonb,error_code=$5,finished_at=now() WHERE tenant_id=$1 AND task_id=$2`,[task.tenant_id,task.task_id,status,result===null?null:JSON.stringify(result),errorCode]);
   await c.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,details)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[task.tenant_id,id("event"),task.created_by,task.agent_id,"AGENT_TASK_"+status,JSON.stringify({taskId:task.task_id,errorCode})]);await c.query("COMMIT");
  }catch(e){try{await c.query("ROLLBACK")}catch{}throw e;}finally{c.release();}
 }
}

export class AgentRuntimeApi {
 constructor(private readonly resolveContext:Resolver,private readonly authorizeAction:Authorizer,private readonly factory:AgentFactory,private readonly runtime:PostgresAgentRuntime,private readonly executorConfigured:boolean){}
 async handle(req:RuntimeRequest):Promise<RuntimeResponse>{
  try{
   const context=await this.resolveContext(req);if(!context)return{status:401,body:{error:"AUTHENTICATION_REQUIRED"}};
   if(context.actor.type!=="user")return{status:403,body:{error:"HUMAN_ACTOR_REQUIRED"}};
   const path=req.path.replace(/\/+$/,"")||"/";
   const permission=path.match(/^\/api\/agents\/([^/]+)\/permissions$/);
   if(permission&&req.method==="POST"){
    if(!await this.authorizeAction(context,"agent.permission.grant"))return{status:403,body:{error:"PERMISSION_ADMIN_REQUIRED"}};
    const b=obj(req.body);const capability=str(b.capability,"capability") as AgentCapability;if(!CAPABILITIES.has(capability))throw new Error("CAPABILITY_INVALID");
    const agentId=decodeURIComponent(permission[1]);
    if(b.action==="REVOKE"){await this.runtime.revoke({tenantId:context.tenantId,agentId,capability,actorId:context.actor.reference});return{status:200,body:{revoked:true}};}
    const grant=await this.runtime.grant({tenantId:context.tenantId,agentId,capability,actorId:context.actor.reference,...(typeof b.expiresAt==="string"?{expiresAt:b.expiresAt}:{})});return{status:201,body:{grant}};
   }
   if(req.method==="POST"&&path==="/api/tasks"){
    if(!this.executorConfigured)return{status:503,body:{error:"AGENT_EXECUTOR_NOT_CONFIGURED"}};
    if(!await this.authorizeAction(context,"agent.task.submit"))return{status:403,body:{error:"TASK_SUBMISSION_FORBIDDEN"}};
    const b=obj(req.body);const agentId=str(b.agentId,"agentId",200);const capability=str(b.capability,"capability") as AgentCapability;if(!CAPABILITIES.has(capability))throw new Error("CAPABILITY_INVALID");
    const input=obj(b.input);const key=str(req.headers?.["idempotency-key"]??b.idempotencyKey,"idempotencyKey",200);
    const task=await this.runtime.enqueue({tenantId:context.tenantId,agentId,taskId:id("task"),createdBy:context.actor.reference,capability,input,idempotencyKey:key});
    return{status:202,body:task};
   }
   const approvalMatch=path.match(/^\/api\/tasks\/([^/]+)\/approve$/);
   if(req.method==="POST"&&approvalMatch){
    if(!await this.authorizeAction(context,"agent.task.approve"))return{status:403,body:{error:"TASK_APPROVAL_FORBIDDEN"}};
    await this.runtime.approveTask({tenantId:context.tenantId,taskId:decodeURIComponent(approvalMatch[1]),actorId:context.actor.reference});
    return{status:200,body:{approved:true,status:"QUEUED"}};
   }
   const taskMatch=path.match(/^\/api\/tasks\/([^/]+)$/);
   if(req.method==="GET"&&taskMatch){
    if(!await this.authorizeAction(context,"agent.task.read"))return{status:403,body:{error:"TASK_READ_FORBIDDEN"}};
    const task=await this.runtime.getTask(context.tenantId,decodeURIComponent(taskMatch[1]));return task?{status:200,body:{task}}:{status:404,body:{error:"TASK_NOT_FOUND"}};
   }
   return{status:404,body:{error:"ROUTE_NOT_FOUND"}};
  }catch(e){return safeError(e);}
 }
}
