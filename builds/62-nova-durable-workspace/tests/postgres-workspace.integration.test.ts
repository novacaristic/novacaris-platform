import { afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { ClientCaseWorkspace, type WorkspaceContext } from "../../61-nova-client-case-workspace/src/client-case-workspace";
import { PostgresWorkspaceStore } from "../src/postgres-workspace-store";

const databaseUrl=process.env.DATABASE_URL;
const pool=databaseUrl ? new Pool({connectionString:databaseUrl,max:4}) : null;
const uuid=()=>crypto.randomUUID();
const content={situation:"Client requested help with daily planning.",intervention:"Reviewed a simple checklist and practiced using it.",response:"Client engaged and selected one manageable action.",plan:"Review checklist use and barriers at the next visit."};
function context(tenantId:string,actor:string,role:WorkspaceContext["actor"]["role"]="clinician"):WorkspaceContext {
 return {tenantId,actor:{type:"user",reference:actor,role},authorizationDecisionReference:"decision-"+uuid()};
}
describe("Build 62 durable PostgreSQL workspace",()=>{
 afterAll(async()=>{await pool?.end();});
 it.skipIf(!pool)("persists draft, independent approval, and append-only audit across separate reads",async()=>{
  const db=pool!;
  const migration=await readFile(new URL("../sql/build_62_workspace.sql",import.meta.url),"utf8");
  await db.query(migration);
  const tenant=uuid(),caseId=uuid();
  await db.query("INSERT INTO nova_workspace_cases(id,tenant_id,status) VALUES($1::uuid,$2::uuid,'active')",[caseId,tenant]);
  const store=new PostgresWorkspaceStore(db);
  const engine=new ClientCaseWorkspace(store,async()=>true,()=>new Date(),uuid);
  const note=await engine.createDraft(context(tenant,"clinician-a"),{caseId,content,source:"human"});
  expect(note.status).toBe("draft");
  const submitted=await engine.submitForReview(context(tenant,"clinician-a"),note.id);
  expect(submitted.status).toBe("submitted_for_review");
  const approved=await engine.review(context(tenant,"supervisor-b","supervisor"),{noteId:note.id,decision:"approve",note:"Reviewed for completeness and follow-up clarity."});
  expect(approved.status).toBe("approved");
  const secondStore=new PostgresWorkspaceStore(db);
  const durable=await secondStore.getNote(tenant,note.id);
  expect(durable?.status).toBe("approved");
  expect(durable?.version).toBe(3);
  const events=await secondStore.listAudit(tenant,note.id);
  expect(events.map(e=>e.action)).toEqual(["draft_created","submitted_for_review","approved"]);
  await expect(db.query("UPDATE nova_workspace_audit SET action='changes_requested' WHERE tenant_id=$1::uuid AND note_id=$2::uuid",[tenant,note.id])).rejects.toThrow("WORKSPACE_AUDIT_APPEND_ONLY");
 });
 it.skipIf(!pool)("rolls back note writes when the audit insert fails",async()=>{
  const db=pool!;
  const migration=await readFile(new URL("../sql/build_62_workspace.sql",import.meta.url),"utf8");
  await db.query(migration);
  const tenant=uuid(),caseId=uuid(),noteId=uuid();
  await db.query("INSERT INTO nova_workspace_cases(id,tenant_id,status) VALUES($1::uuid,$2::uuid,'active')",[caseId,tenant]);
  const store=new PostgresWorkspaceStore(db);
  const n={id:noteId,tenantId:tenant,caseId,authorReference:"clinician",source:"human" as const,content,status:"draft" as const,version:1,complianceBlockers:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await expect(store.persistNoteAndAudit(n,{eventId:"not-a-uuid",tenantId:tenant,noteId,actorReference:"clinician",action:"draft_created",occurredAt:new Date().toISOString(),authorizationDecisionReference:"decision",details:{}})).rejects.toThrow();
  expect(await store.getNote(tenant,noteId)).toBeNull();
 });
});
