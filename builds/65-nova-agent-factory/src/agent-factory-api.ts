import type { RequestContext } from "../../../builds/44-shared-platform-foundation/src/contracts.js";
import { AgentFactory, type AgentCapability, type AgentDomain, type AgentLifecycle, type AgentRisk, type AgentAction } from "./agent-factory.js";

export interface AgentApiRequest { method:string; path:string; body?:unknown; headers?:Record<string,string|undefined>; }
export interface AgentApiResponse { status:number; body:unknown; }
type ContextResolver=(request:AgentApiRequest)=>Promise<RequestContext|null>;
type Authorizer=(context:RequestContext,action:string)=>Promise<boolean>;
const capabilities=new Set<AgentCapability>(["crm.read","crm.draft","crm.write","marketing.research","marketing.draft","marketing.publish","finance.analyze","finance.forecast","finance.payment.prepare","research.web","research.documents","research.due_diligence","operations.plan","operations.execute","compliance.assess","evidence.read","evidence.write","funding.discover","security.assess","agent.create"]);
const domains=new Set<AgentDomain>(["SALES","MARKETING","FINANCE","RESEARCH","OPERATIONS","COMPLIANCE","FUNDING","SECURITY","CUSTOM"]);
const risks=new Set<AgentRisk>(["LOW","MODERATE","HIGH","CRITICAL"]);
const actions=new Set<AgentAction>(["READ","RECOMMEND","PREPARE","EXECUTE_WITH_APPROVAL","AUTONOMOUS"]);
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("REQUEST_BODY_INVALID");return v as Record<string,unknown>;}
function text(v:unknown,field:string,max=2000):string{if(typeof v!=="string"||!v.trim()||v.length>max)throw new Error("FIELD_INVALID:"+field);return v.trim();}
function error(e:unknown):AgentApiResponse{const code=e instanceof Error?e.message:"INTERNAL_ERROR";const status=/FORBIDDEN|DENIED|SELF_APPROVAL|HUMAN_APPROVAL/.test(code)?403:/NOT_FOUND/.test(code)?404:/ALREADY_EXISTS|CONFLICT|TRANSITION/.test(code)?409:/INVALID|REQUIRED|CAPABILITY/.test(code)?400:500;return{status,body:{error:code}};}
export class AgentFactoryApi {
 constructor(private readonly resolveContext:ContextResolver,private readonly authorize:Authorizer,private readonly factory:AgentFactory){}
 async handle(req:AgentApiRequest):Promise<AgentApiResponse>{
  try{
   const context=await this.resolveContext(req);if(!context)return{status:401,body:{error:"AUTHENTICATION_REQUIRED"}};
   if(context.actor.type!=="user")return{status:403,body:{error:"HUMAN_ACTOR_REQUIRED"}};
   const path=req.path.replace(/\/+$/,"")||"/";
   if(req.method==="POST"&&path==="/api/agents"){
    if(!await this.authorize(context,"agent.manage"))return{status:403,body:{error:"AGENT_MANAGEMENT_FORBIDDEN"}};
    const b=object(req.body);const requestedCapabilities=b.requestedCapabilities;
    if(!Array.isArray(requestedCapabilities)||requestedCapabilities.length===0||requestedCapabilities.some(v=>typeof v!=="string"||!capabilities.has(v as AgentCapability)))throw new Error("AGENT_CAPABILITIES_INVALID");
    const domain=text(b.domain,"domain") as AgentDomain;if(!domains.has(domain))throw new Error("AGENT_DOMAIN_INVALID");
    const risk=text(b.requestedRisk,"requestedRisk") as AgentRisk;if(!risks.has(risk))throw new Error("AGENT_RISK_INVALID");
    const ceiling=text(b.requestedActionCeiling,"requestedActionCeiling") as AgentAction;if(!actions.has(ceiling))throw new Error("AGENT_ACTION_CEILING_INVALID");
    const record=await this.factory.requestCreation({requestId:context.requestId,tenantId:context.tenantId,requesterId:context.actor.reference,requestedName:text(b.requestedName,"requestedName",120),purpose:text(b.purpose,"purpose"),domain,requestedCapabilities:requestedCapabilities as AgentCapability[],requestedRisk:risk,requestedActionCeiling:ceiling,createdAt:new Date().toISOString()});
    return{status:201,body:{item:record}};
   }
   const match=path.match(/^\/api\/agents\/([^/]+)\/transition$/);
   if(req.method==="POST"&&match){
    if(!await this.authorize(context,"agent.manage"))return{status:403,body:{error:"AGENT_MANAGEMENT_FORBIDDEN"}};
    const b=object(req.body);const next=text(b.next,"next") as AgentLifecycle;
    const allowed=new Set<AgentLifecycle>(["BUILDING","TESTING","APPROVAL_REQUIRED","APPROVED","REGISTERED","ACTIVE","SUSPENDED","FAILED","RETIRED"]);
    if(!allowed.has(next))throw new Error("AGENT_TRANSITION_INVALID");
    const record=await this.factory.transition(context.tenantId,decodeURIComponent(match[1]),next,context.actor.reference,text(b.reason,"reason",1000));
    return{status:200,body:{item:record}};
   }
   return{status:404,body:{error:"ROUTE_NOT_FOUND"}};
  }catch(e){return error(e);}
 }
}
