import { describe, expect, it } from "vitest";
import { AgentFactory, defaultFactoryPolicy, type AgentCreateCommand, type AgentFactoryStore, type AgentRecord, type FactoryEvent } from "../src/agent-factory.js";
import { decideAgentCapability } from "../src/permission-policy.js";
class MemoryStore implements AgentFactoryStore {
 records=new Map<string,AgentRecord>(); events:FactoryEvent[]=[];
 async findByName(t:string,n:string){return [...this.records.values()].find(r=>r.tenantId===t&&r.profile.name.toLowerCase()===n);}
 async countActive(t:string){return [...this.records.values()].filter(r=>r.tenantId===t&&r.lifecycle==="ACTIVE").length;}
 async insert(r:AgentRecord){this.records.set(r.id,r);}
 async get(t:string,id:string){const r=this.records.get(id);return r?.tenantId===t?r:undefined;}
 async replace(r:AgentRecord,v:number){const old=this.records.get(r.id);if(!old||old.version!==v)throw new Error("VERSION_CONFLICT");this.records.set(r.id,r);}
 async appendEvent(e:FactoryEvent){this.events.push(e);}
}
const command=(overrides:Partial<AgentCreateCommand>={}):AgentCreateCommand=>({requestId:"req-1",tenantId:"tenant-a",requesterId:"owner-1",requestedName:"Research Agent",purpose:"Compare evidence.",domain:"RESEARCH",requestedCapabilities:["research.web"],requestedRisk:"LOW",requestedActionCeiling:"PREPARE",createdAt:new Date().toISOString(),...overrides});
describe("NOVA Agent Factory",()=>{
 it("creates an inactive agent spec and appends an audit event",async()=>{const s=new MemoryStore();const f=new AgentFactory(s,defaultFactoryPolicy);const r=await f.requestCreation(command());expect(r.lifecycle).toBe("SPECIFIED");expect(s.events[0].event).toBe("AGENT_CREATION_REQUESTED");});
 it("rejects duplicate names within one tenant",async()=>{const f=new AgentFactory(new MemoryStore(),defaultFactoryPolicy);await f.requestCreation(command());await expect(f.requestCreation(command({requestId:"req-2"}))).rejects.toThrow("AGENT_NAME_ALREADY_EXISTS");});
 it("rejects capabilities outside policy",async()=>{const f=new AgentFactory(new MemoryStore(),{...defaultFactoryPolicy,allowedCapabilities:[]});await expect(f.requestCreation(command())).rejects.toThrow("CAPABILITY_NOT_ALLOWED");});
 it("prevents requester from approving their own agent",async()=>{const s=new MemoryStore();const f=new AgentFactory(s,defaultFactoryPolicy);const r=await f.requestCreation(command());await expect(f.transition("tenant-a",r.id,"APPROVED","owner-1","self approve")).rejects.toThrow("SELF_APPROVAL_DENIED");});
 it("requires an explicit grant and denies cross-tenant access",()=>{const r:AgentRecord={id:"a1",tenantId:"tenant-a",profile:{id:"p1",name:"Research",purpose:"Research",domain:"RESEARCH",risk:"LOW",capabilities:["research.web"],defaultActionCeiling:"PREPARE",requiresHumanApprovalForActivation:true,description:"test"},lifecycle:"ACTIVE",requestedBy:"owner-1",approvedBy:"admin-1",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:1};const p={tenantId:"tenant-a",subject:"owner-1",role:"owner" as const,capabilities:[]};expect(decideAgentCapability({principal:p,agent:r,capability:"research.web",grant:null}).reason).toBe("EXPLICIT_PERMISSION_GRANT_REQUIRED");expect(decideAgentCapability({principal:{...p,tenantId:"tenant-b"},agent:r,capability:"research.web",grant:{tenantId:"tenant-a",agentId:"a1",capability:"research.web",grantedBy:"owner-1",allowed:true,requiresHumanApproval:true}}).reason).toBe("TENANT_SCOPE_MISMATCH");});
});
