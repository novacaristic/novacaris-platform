import { describe, expect, it } from "vitest";
import { AgentTaskDispatcher, type AgentTask, type AgentTaskStore } from "../src/agent-task-dispatcher.js";
import type { AgentFactoryStore, AgentRecord, FactoryEvent } from "../../65-nova-agent-factory/src/agent-factory.js";

class Agents implements AgentFactoryStore {
  records = new Map<string, AgentRecord>();
  async findByName(){ return undefined; }
  async countActive(){ return 0; }
  async insert(r:AgentRecord){ this.records.set(r.id,r); }
  async get(t:string,id:string){ const r=this.records.get(id); return r?.tenantId===t?r:undefined; }
  async replace(){ }
  async appendEvent(_e:FactoryEvent){ }
}
class Tasks implements AgentTaskStore {
  records = new Map<string,AgentTask>();
  async findByIdempotency(t:string,a:string,k:string){ return [...this.records.values()].find(x=>x.tenantId===t&&x.agentId===a&&x.idempotencyKey===k); }
  async create(t:AgentTask){ if(await this.findByIdempotency(t.tenantId,t.agentId,t.idempotencyKey)) throw new Error("DUPLICATE"); this.records.set(t.id,t); }
  async claim(_w:string,limit:number){ const q=[...this.records.values()].filter(t=>t.status==="QUEUED").slice(0,limit).map(t=>({...t,status:"RUNNING" as const,attemptCount:t.attemptCount+1})); q.forEach(t=>this.records.set(t.id,t)); return q; }
  async finish(t:AgentTask){ this.records.set(t.id,t); }
  async fail(id:string,tenant:string,_w:string,code:string,retryable:boolean){ const t=this.records.get(id); if(t&&t.tenantId===tenant)this.records.set(id,{...t,status:retryable?"QUEUED":"FAILED",errorCode:code}); }
  async get(t:string,id:string){ const r=this.records.get(id); return r?.tenantId===t?r:undefined; }
}
const agent:AgentRecord={id:"agent-1",tenantId:"tenant-a",profile:{id:"profile-1",name:"Research",purpose:"Research",domain:"RESEARCH",risk:"LOW",capabilities:["research.web"],defaultActionCeiling:"PREPARE",requiresHumanApprovalForActivation:true,description:"test"},lifecycle:"ACTIVE",requestedBy:"owner-1",approvedBy:"admin-1",createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",version:2};
const principal={tenantId:"tenant-a",subject:"owner-1",role:"owner" as const};
const input={principal,agentId:"agent-1",taskType:"web_research",capability:"research.web" as const,input:{query:"market overview"},idempotencyKey:"request-001"};
function setup(decision:{allowed:boolean;requiresHumanApproval:boolean;reason:string}={allowed:true,requiresHumanApproval:false,reason:"ALLOWED"}){
 const agents=new Agents();agents.records.set(agent.id,agent);const tasks=new Tasks();
 const dispatcher=new AgentTaskDispatcher(agents,tasks,{authorize:async()=>decision},()=>new Date("2026-01-01T00:00:00.000Z"));
 return {dispatcher,tasks};
}
describe("NOVA agent task dispatcher",()=>{
 it("queues a task only for an active authorized agent",async()=>{const {dispatcher}=setup();const task=await dispatcher.submit(input);expect(task.status).toBe("QUEUED");});
 it("holds tasks for explicit human approval",async()=>{const {dispatcher}=setup({allowed:false,requiresHumanApproval:true,reason:"HUMAN_APPROVAL_REQUIRED"});expect((await dispatcher.submit(input)).status).toBe("WAITING_APPROVAL");});
 it("denies permission failures",async()=>{const {dispatcher}=setup({allowed:false,requiresHumanApproval:false,reason:"DENIED"});await expect(dispatcher.submit(input)).rejects.toThrow("TASK_PERMISSION_DENIED:DENIED");});
 it("returns an existing task for an identical idempotent request",async()=>{const {dispatcher,tasks}=setup();const first=await dispatcher.submit(input);const second=await dispatcher.submit(input);expect(second.id).toBe(first.id);expect(tasks.records.size).toBe(1);});
 it("rejects an idempotency key reused with different input",async()=>{const {dispatcher}=setup();await dispatcher.submit(input);await expect(dispatcher.submit({...input,input:{query:"different"}})).rejects.toThrow("IDEMPOTENCY_FINGERPRINT_CONFLICT");});
 it("runs a bounded batch and records success",async()=>{const {dispatcher}=setup();const task=await dispatcher.submit(input);const summary=await dispatcher.runBatch({workerId:"worker-a",execute:async()=>({answer:"done"})});expect(summary).toEqual({claimed:1,succeeded:1,failed:0});expect((await dispatcher.get("tenant-a",task.id))?.status).toBe("SUCCEEDED");});
 it("does not return tasks across tenant boundaries",async()=>{const {dispatcher}=setup();const task=await dispatcher.submit(input);expect(await dispatcher.get("tenant-b",task.id)).toBeUndefined();});
});
