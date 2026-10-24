import type { Pool, PoolClient } from "pg";
import type { AgentFactoryStore, AgentRecord, FactoryEvent, AgentLifecycle, AgentDomain, AgentRisk, AgentAction, AgentCapability } from "./agent-factory.js";

type Row = {
 tenant_id:string; agent_id:string; profile_id:string; name:string; purpose:string; domain:AgentDomain;
 risk:AgentRisk; capabilities:AgentCapability[]|string; action_ceiling:AgentAction; lifecycle:AgentLifecycle;
 requested_by:string; approved_by:string|null; version:number; created_at:Date|string; updated_at:Date|string;
};
const iso=(v:Date|string)=>v instanceof Date?v.toISOString():new Date(v).toISOString();
const normalize=(s:string)=>s.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g," ");
function mapRow(r:Row):AgentRecord {
 const capabilities=typeof r.capabilities==="string"?JSON.parse(r.capabilities):r.capabilities;
 return {id:r.agent_id,tenantId:r.tenant_id,profile:{id:r.profile_id,name:r.name,purpose:r.purpose,domain:r.domain,risk:r.risk,capabilities,defaultActionCeiling:r.action_ceiling,requiresHumanApprovalForActivation:true,description:"Persisted NOVA specialist agent."},lifecycle:r.lifecycle,requestedBy:r.requested_by,...(r.approved_by?{approvedBy:r.approved_by}:{}),version:Number(r.version),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};
}
const SELECT=`SELECT tenant_id,agent_id,profile_id,name,purpose,domain,risk,capabilities,action_ceiling,lifecycle,requested_by,approved_by,version,created_at,updated_at FROM nova_agents.agent_profiles`;
interface DbClient {query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[];rowCount:number|null}>;release():void;}
interface DbPool {query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[];rowCount:number|null}>;connect():Promise<DbClient>;}
export class PostgresAgentFactoryStore implements AgentFactoryStore {
 constructor(private readonly pool:DbPool){}
 async findByName(tenantId:string,normalizedName:string){const r=await this.pool.query<Row>(SELECT+" WHERE tenant_id=$1 AND normalized_name=$2",[tenantId,normalize(normalizedName)]);return r.rows[0]?mapRow(r.rows[0]):undefined;}
 async countActive(tenantId:string){const r=await this.pool.query<{count:string}>( "SELECT count(*)::text AS count FROM nova_agents.agent_profiles WHERE tenant_id=$1 AND lifecycle='ACTIVE'",[tenantId]);return Number(r.rows[0]?.count??0);}
 async insert(record:AgentRecord):Promise<void>{
  const c=await this.pool.connect();
  try{await c.query("BEGIN");
   await c.query(`INSERT INTO nova_agents.agent_profiles (tenant_id,agent_id,profile_id,name,normalized_name,purpose,domain,risk,capabilities,action_ceiling,lifecycle,requested_by,approved_by,version,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::timestamptz,$16::timestamptz)`,
    [record.tenantId,record.id,record.profile.id,record.profile.name,normalize(record.profile.name),record.profile.purpose,record.profile.domain,record.profile.risk,JSON.stringify(record.profile.capabilities),record.profile.defaultActionCeiling,record.lifecycle,record.requestedBy,record.approvedBy??null,record.version,record.createdAt,record.updatedAt]);
   await c.query("COMMIT");
  }catch(e){try{await c.query("ROLLBACK")}catch{}throw e}finally{c.release()}
 }
 async get(tenantId:string,agentId:string){const r=await this.pool.query<Row>(SELECT+" WHERE tenant_id=$1 AND agent_id=$2",[tenantId,agentId]);return r.rows[0]?mapRow(r.rows[0]):undefined;}
 async replace(record:AgentRecord,expectedVersion:number):Promise<void>{
  const r=await this.pool.query(`UPDATE nova_agents.agent_profiles SET lifecycle=$3,approved_by=$4,version=$5,updated_at=$6::timestamptz
   WHERE tenant_id=$1 AND agent_id=$2 AND version=$7`,
   [record.tenantId,record.id,record.lifecycle,record.approvedBy??null,record.version,record.updatedAt,expectedVersion]);
  if(r.rowCount!==1)throw new Error("AGENT_VERSION_CONFLICT");
 }
 async appendEvent(event:FactoryEvent):Promise<void>{
  await this.pool.query(`INSERT INTO nova_agents.audit_events(tenant_id,event_id,actor_id,agent_id,event_type,occurred_at,details)
   VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb)`,
   [event.tenantId,event.id,event.actorId,event.agentId,event.event,event.occurredAt,JSON.stringify(event.details)]);
 }
}
