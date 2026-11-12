import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts.js";
import { AgentRuntimeApi } from "../src/agent-runtime.js";
import type { AgentFactory } from "../src/agent-factory.js";
import type { PostgresAgentRuntime } from "../src/agent-runtime.js";

const context:RequestContext={contractVersion:"1.0",requestId:"req-1",correlationId:"corr-1",tenantId:"tenant-a",actor:{type:"user",reference:"user-1"}};
function makeApi(options:{authorized?:boolean;executorConfigured?:boolean}={}){
 const resolve=vi.fn(async()=>context);
 const authorize=vi.fn(async()=>options.authorized??true);
 const factory={} as AgentFactory;
 const runtime={} as PostgresAgentRuntime;
 return {api:new AgentRuntimeApi(resolve,authorize,factory,runtime,options.executorConfigured??false),resolve,authorize};
}
describe("AgentRuntimeApi security gates",()=>{
 it("fails closed for task submission when no reviewed executor adapter is configured",async()=>{
  const {api,authorize}=makeApi({executorConfigured:false});
  const response=await api.handle({method:"POST",path:"/api/tasks",body:{agentId:"agent-1",capability:"research.web",input:{query:"test"},idempotencyKey:"key-1"}});
  expect(response.status).toBe(503);
  expect(response.body).toEqual({error:"AGENT_EXECUTOR_NOT_CONFIGURED"});
  expect(authorize).not.toHaveBeenCalled();
 });
 it("requires explicit permission-administration authorization before granting",async()=>{
  const {api,authorize}=makeApi({authorized:false});
  const response=await api.handle({method:"POST",path:"/api/agents/agent-1/permissions",body:{capability:"research.web"}});
  expect(response.status).toBe(403);
  expect(response.body).toEqual({error:"PERMISSION_ADMIN_REQUIRED"});
  expect(authorize).toHaveBeenCalledWith(context,"agent.permission.grant");
 });
 it("rejects agent/service actors for human governance routes",async()=>{
  const {api}=makeApi();
  const serviceContext={...context,actor:{type:"agent" as const,reference:"agent-1"}};
  const apiWithAgent=new AgentRuntimeApi(async()=>serviceContext,async()=>true,{} as AgentFactory,{} as PostgresAgentRuntime,false);
  const response=await apiWithAgent.handle({method:"POST",path:"/api/agents/agent-1/permissions",body:{capability:"research.web"}});
  expect(response.status).toBe(403);
  expect(response.body).toEqual({error:"HUMAN_ACTOR_REQUIRED"});
 });
});
