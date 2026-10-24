import type { AgentCapability, AgentRecord } from "./agent-factory.js";
export type PrincipalRole = "owner" | "administrator" | "supervisor" | "agent";
export interface Principal { tenantId:string; subject:string; role:PrincipalRole; capabilities:string[]; }
export interface PermissionGrant { tenantId:string; agentId:string; capability:AgentCapability; grantedBy:string; allowed:boolean; requiresHumanApproval:boolean; expiresAt?:string; }
export interface PermissionDecision { allowed:boolean; requiresHumanApproval:boolean; reason:string; }
/** Deny-by-default permission lock. Tenant scope and active lifecycle are checked before grants. */
export function decideAgentCapability(input:{principal:Principal|null;agent:AgentRecord|null;capability:AgentCapability;grant:PermissionGrant|null;now?:Date}):PermissionDecision{
 const {principal,agent,grant}=input;
 if(!principal)return{allowed:false,requiresHumanApproval:false,reason:"AUTHENTICATION_REQUIRED"};
 if(!agent)return{allowed:false,requiresHumanApproval:false,reason:"AGENT_NOT_FOUND"};
 if(principal.tenantId!==agent.tenantId||(grant&&grant.tenantId!==principal.tenantId))return{allowed:false,requiresHumanApproval:false,reason:"TENANT_SCOPE_MISMATCH"};
 if(agent.lifecycle!=="ACTIVE")return{allowed:false,requiresHumanApproval:false,reason:"AGENT_NOT_ACTIVE"};
 if(!agent.profile.capabilities.includes(input.capability))return{allowed:false,requiresHumanApproval:false,reason:"CAPABILITY_NOT_IN_AGENT_PROFILE"};
 if(!grant||!grant.allowed||grant.agentId!==agent.id||grant.capability!==input.capability)return{allowed:false,requiresHumanApproval:false,reason:"EXPLICIT_PERMISSION_GRANT_REQUIRED"};
 if(grant.expiresAt&&new Date(grant.expiresAt).getTime()<=(input.now??new Date()).getTime())return{allowed:false,requiresHumanApproval:false,reason:"PERMISSION_GRANT_EXPIRED"};
 if(principal.role==="agent"&&principal.subject===grant.grantedBy)return{allowed:false,requiresHumanApproval:false,reason:"AGENT_CANNOT_GRANT_OWN_PERMISSION"};
 if(!["owner","administrator"].includes(principal.role)&&!principal.capabilities.includes("agent.permission.grant"))return{allowed:false,requiresHumanApproval:false,reason:"PERMISSION_ADMIN_ROLE_REQUIRED"};
 return{allowed:true,requiresHumanApproval:grant.requiresHumanApproval,reason:grant.requiresHumanApproval?"ALLOWED_PENDING_HUMAN_APPROVAL":"ALLOWED"};
}
