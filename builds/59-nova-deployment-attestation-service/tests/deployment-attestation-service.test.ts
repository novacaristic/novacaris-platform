import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { DeploymentAttestationService } from "../src/deployment-attestation-service";
import { buildAttestationPayload, canonicalJson } from "../../../builds/58-nova-signed-release-attestation/src/provenance-attestation";
import type { SmokeReport } from "../../../builds/57-nova-deployment-evidence-ledger/src/release-gate";

const tenantId = "00000000-0000-4000-8000-000000000059";
const report: SmokeReport = { schemaVersion:"1.0", reportType:"nova-deployment-smoke", runId:"smoke_run_1234", startedAt:"2026-10-09T08:00:00.000Z", completedAt:"2026-10-09T08:00:01.000Z", baseUrlConfigured:true, result:"passed", passedChecks:1, totalChecks:1, checks:[{name:"readiness",passed:true,status:200}], limitations:["synthetic test"] };
const evidence = { id:"17", environment:"staging", commit_sha:"a".repeat(40), smoke_run_id:report.runId, smoke_report:report, test_run_url:"https://github.com/novacaristic/novacaris-platform/actions/runs/123456789", eligible:true };
const context = { tenantId, actor:{type:"user" as const, reference:"reviewer-59"}, authorizationDecisionReference:"authz-decision-59" };
const now = new Date("2026-10-09T08:01:00.000Z");
function fixture() {
 const pair=generateKeyPairSync("ed25519");
 const payload=buildAttestationPayload({environment:evidence.environment,commitSha:evidence.commit_sha,smokeReport:report,testRunUrl:evidence.test_run_url,issuedAt:"2026-10-09T08:00:30.000Z"});
 const signatureBase64=sign(null,Buffer.from(canonicalJson(payload)),pair.privateKey).toString("base64");
 const attestation={algorithm:"Ed25519",keyId:"ci-key-59",payload,signatureBase64};
 const queries:string[]=[];
 const client={
  query:vi.fn(async (sql:string)=>{
   queries.push(sql);
   if(sql.includes("SELECT id, environment, commit_sha")) return {rows:[evidence]};
   if(sql.includes("SELECT public_key_pem")) return {rows:[{public_key_pem:pair.publicKey.export({type:"spki",format:"pem"}).toString()}]};
   if(sql.includes("SELECT id, payload_sha256")) return {rows:[]};
   if(sql.includes("INSERT INTO nova_deployment_signed_attestations")) return {rows:[{id:"901"}]};
   return {rows:[]};
  }),
  release:vi.fn(),
 };
 const pool={connect:vi.fn(async()=>client)} as unknown as Pool;
 const ledger={approve:vi.fn(async()=>({ledgerId:"17",approved:true as const,replayed:false}))};
 const service=new DeploymentAttestationService(pool,ledger as never,vi.fn(async()=>true),()=>now);
 return {service,attestation,queries,client,ledger,pair};
}
describe("Build 59 deployment attestation service",()=>{
 it("verifies and transactionally records a signed attestation with an audit event",async()=>{
  const f=fixture();
  const result=await f.service.submit(context,{ledgerId:"17",requestId:"request-59",attestation:f.attestation});
  expect(result.verified).toBe(true); expect(result.attestationId).toBe("901"); expect(result.replayed).toBe(false);
  expect(f.queries.some(q=>q==="BEGIN")).toBe(true); expect(f.queries.some(q=>q.includes("INSERT INTO nova_deployment_signed_attestations"))).toBe(true); expect(f.queries.some(q=>q.includes("attestation_verified"))).toBe(true); expect(f.queries.some(q=>q==="COMMIT")).toBe(true);
 });
 it("fails closed for a bad signature and never inserts it as verified",async()=>{
  const f=fixture(); f.attestation.signatureBase64=Buffer.from("invalid signature").toString("base64");
  const result=await f.service.submit(context,{ledgerId:"17",requestId:"request-bad",attestation:f.attestation});
  expect(result.verified).toBe(false); expect(result.blockers).toContain("ATTESTATION_SIGNATURE_INVALID");
  expect(f.queries.some(q=>q.includes("INSERT INTO nova_deployment_signed_attestations"))).toBe(false);
 });
 it("requires a human actor and an authorization decision reference",async()=>{
  const f=fixture();
  await expect(f.service.submit({...context,actor:{type:"agent",reference:"mr-nova"}},{ledgerId:"17",requestId:"request-59",attestation:f.attestation})).rejects.toThrow("DEPLOYMENT_ATTESTATION_HUMAN_ACTOR_REQUIRED");
  await expect(f.service.submit({...context,authorizationDecisionReference:""},{ledgerId:"17",requestId:"request-59",attestation:f.attestation})).rejects.toThrow("DEPLOYMENT_ATTESTATION_AUTHORIZATION_REFERENCE_REQUIRED");
 });
 it("requires policy authorization before opening a database transaction",async()=>{
  const f=fixture();
  const denied=new DeploymentAttestationService({connect:vi.fn()} as unknown as Pool,{} as never,vi.fn(async()=>false),()=>now);
  await expect(denied.submit(context,{ledgerId:"17",requestId:"request-59",attestation:f.attestation})).rejects.toThrow("DEPLOYMENT_ATTESTATION_SUBMIT_FORBIDDEN");
 });
 it("blocks missing or ineligible evidence and unknown signing keys",async()=>{
  const f=fixture();
  f.client.query.mockImplementation(async (sql:string)=>{
   f.queries.push(sql);
   if(sql.includes("SELECT id, environment, commit_sha")) return {rows:[{...evidence,eligible:false}]};
   return {rows:[]};
  });
  await expect(f.service.submit(context,{ledgerId:"17",requestId:"request-59",attestation:f.attestation})).rejects.toThrow("DEPLOYMENT_RELEASE_GATE_BLOCKED");
 });
});
