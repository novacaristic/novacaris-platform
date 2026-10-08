import { AgentRegistry } from "../domain/registry.js";
import { EvidenceLedger } from "../domain/ledger.js";
import { canAct } from "../domain/agents.js";
import { createSecureSessionId } from "./secure-session.js";
import { assertOrganizationScope } from "./identity.js";

export function runSecuritySelfTest():{passed:boolean;checks:string[]}{
 const checks:string[]=[];
 const a=createSecureSessionId(),b=createSecureSessionId();
 if(a===b||a.length<40)throw new Error("Secure session ID generation failed"); checks.push("secure session IDs");
 const registry=new AgentRegistry();
 registry.register({id:"mr-nova",name:"Mr. NOVA",purpose:"orchestration",risk:"HIGH",modelPolicy:{allowedProviders:["approved"],requireProvenance:true},defaultActionCeiling:"EXECUTE_WITH_APPROVAL"});
 registry.grant({id:"p1",agentId:"mr-nova",resource:"workspace",actions:["EXECUTE_WITH_APPROVAL"],scopes:["org-1"],decision:"REQUIRE_APPROVAL",requiresHumanApproval:true});
 const decision=registry.authorize("mr-nova","p1","EXECUTE_WITH_APPROVAL");
 if(!decision.allowed||!decision.requiresApproval)throw new Error("Trust authorization failed"); checks.push("permission + approval gate");
 const ledger=new EvidenceLedger(); const req=ledger.requestAuthorization({id:"auth:test",agentId:"mr-nova",action:"EXECUTE_WITH_APPROVAL",subjectId:"org-1",evidenceIds:[]});
 ledger.decideAuthorization(req.id,"APPROVED","human-1","Approved for test");
 if(ledger.getAuthorization(req.id)?.status!=="APPROVED")throw new Error("Ledger approval failed"); checks.push("human authorization ledger");
 const session={sessionId:"s",userId:"u",organizationId:"org-1",roles:["OWNER"] as const,authenticatedAt:new Date().toISOString()};
 assertOrganizationScope(session,"org-1");
 let blocked=false;try{assertOrganizationScope(session,"org-2")}catch{blocked=true}
 if(!blocked)throw new Error("Organization scope isolation failed"); checks.push("organization isolation");
 if(canAct({id:"a",name:"a",purpose:"",risk:"LOW",modelPolicy:{allowedProviders:[],requireProvenance:true},defaultActionCeiling:"READ"},{id:"p",agentId:"a",resource:"",actions:["AUTONOMOUS"],scopes:[],decision:"ALLOW",requiresHumanApproval:false},"AUTONOMOUS").allowed)throw new Error("Risk ceiling failed");
 checks.push("agent risk ceiling"); return {passed:true,checks};
}
