import type { WorkspaceContext, WorkspaceNote, WorkspaceAuditEvent } from "../../61-nova-client-case-workspace/src/client-case-workspace";
import { ClientCaseWorkspace, WorkspaceError } from "../../61-nova-client-case-workspace/src/client-case-workspace";

export interface WorkspaceApiRequest { method:string; path:string; body?:unknown; headers?:Record<string,string|undefined>; }
export interface WorkspaceApiResponse { status:number; body:unknown; }
export type WorkspaceContextResolver = (request:WorkspaceApiRequest)=>Promise<WorkspaceContext|null>;
function bodyObject(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))throw new WorkspaceError("REQUEST_BODY_INVALID");return v as Record<string,unknown>;}
function field(b:Record<string,unknown>,k:string):string{const v=b[k];if(typeof v!=="string"||!v.trim())throw new WorkspaceError("FIELD_REQUIRED:"+k);return v.trim();}
function mapError(e:unknown):WorkspaceApiResponse{
 const code=e instanceof WorkspaceError?e.code:e instanceof Error?e.message:"INTERNAL_ERROR";
 const status= /AUTH_CONTEXT|HUMAN_ACTOR|POLICY_DENIED|SUPERVISOR_ROLE|SELF_APPROVAL/.test(code)?403:
 /NOT_FOUND/.test(code)?404:/CONFLICT|INVALID_STATE|ALREADY_|NOT_AWAITING|VERSION/.test(code)?409:
 /REQUIRED|INVALID|INCOMPLETE|BLOCKED/.test(code)?400:500;
 return {status,body:{error:code}};
}
export class WorkspaceApi {
 constructor(private readonly resolveContext:WorkspaceContextResolver,private readonly workspace:ClientCaseWorkspace,
   private readonly listAudit?:(tenantId:string,noteId:string)=>Promise<WorkspaceAuditEvent[]>){}
 async handle(req:WorkspaceApiRequest):Promise<WorkspaceApiResponse>{
  try{
   const c=await this.resolveContext(req);if(!c)return {status:401,body:{error:"AUTHENTICATION_REQUIRED"}};
   const path=req.path.replace(/\/+$/,"")||"/";
   if(req.method==="POST"&&path==="/api/workspace/notes"){
    const b=bodyObject(req.body);const source=b.source==="ai_assisted"?"ai_assisted":b.source==="human"?"human":undefined;
    if(!source)throw new WorkspaceError("NOTE_SOURCE_INVALID");
    const content=bodyObject(b.content) as unknown as {situation:string;intervention:string;response:string;plan:string};
    const note=await this.workspace.createDraft(c,{caseId:field(b,"caseId"),content,source});return {status:201,body:{item:note}};
   }
   const match=path.match(/^\/api\/workspace\/notes\/([^/]+)(?:\/(submit|review|audit))?$/);
   if(!match)return {status:404,body:{error:"ROUTE_NOT_FOUND"}};
   const noteId=decodeURIComponent(match[1]);const action=match[2];
   if(req.method==="POST"&&action==="submit")return {status:200,body:{item:await this.workspace.submitForReview(c,noteId)}};
   if(req.method==="POST"&&action==="review"){
    const b=bodyObject(req.body);const decision=b.decision;
    if(decision!=="approve"&&decision!=="request_changes")throw new WorkspaceError("REVIEW_DECISION_INVALID");
    return {status:200,body:{item:await this.workspace.review(c,{noteId,decision,note:field(b,"note")})}};
   }
   if(req.method==="GET"&&action==="audit"&&this.listAudit)return {status:200,body:{items:await this.listAudit(c.tenantId,noteId)}};
   return {status:404,body:{error:"ROUTE_NOT_FOUND"}};
  }catch(e){return mapError(e);}
 }
}
