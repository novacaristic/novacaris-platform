import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAttestationPayload, canonicalJson, evaluateSignedReleaseGate, verifyReleaseAttestation } from "../src/provenance-attestation";
import type { SmokeReport } from "../../../builds/57-nova-deployment-evidence-ledger/src/release-gate";

const report: SmokeReport = {schemaVersion:"1.0",reportType:"nova-deployment-smoke",runId:"smoke_run_1234",startedAt:"2026-10-09T08:00:00.000Z",completedAt:"2026-10-09T08:00:01.000Z",baseUrlConfigured:true,result:"passed",passedChecks:1,totalChecks:1,checks:[{name:"readiness",passed:true,status:200}],limitations:["HTTP checks only"]};
const issuedAt="2026-10-09T08:00:30.000Z";
function fixture() {
 const pair=generateKeyPairSync("ed25519");
 const expected={environment:"staging",commitSha:"a".repeat(40),smokeReport:report,testRunUrl:"https://github.com/novacaristic/novacaris-platform/actions/runs/123456789"};
 const payload=buildAttestationPayload({...expected,issuedAt});
 const signatureBase64=sign(null,Buffer.from(canonicalJson(payload)),pair.privateKey).toString("base64");
 return {expected,payload,signatureBase64,trustedKeys:new Map([["ci-key-1",pair.publicKey]])};
}
describe("Build 58 signed release provenance",()=>{
 it("verifies a trusted Ed25519 signature bound to environment, commit, report digest, and CI run",()=>{
  const f=fixture();const result=verifyReleaseAttestation({attestation:{algorithm:"Ed25519",keyId:"ci-key-1",payload:f.payload,signatureBase64:f.signatureBase64},trustedKeys:f.trustedKeys,expected:f.expected,now:new Date("2026-10-09T08:01:00.000Z")});expect(result.verified).toBe(true);expect(result.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
 });
 it("rejects tampered report, environment, commit, and run URL",()=>{
  const f=fixture();const attestation={algorithm:"Ed25519",keyId:"ci-key-1",payload:f.payload,signatureBase64:f.signatureBase64};
  const changed={...f.expected,commitSha:"c".repeat(40)};
  const result=verifyReleaseAttestation({attestation,trustedKeys:f.trustedKeys,expected:changed,now:new Date("2026-10-09T08:01:00.000Z")});expect(result.verified).toBe(false);expect(result.blockers).toContain("ATTESTATION_COMMIT_MISMATCH");
  const changedReport={...f.expected,smokeReport:{...report,result:"failed"}};
  expect(verifyReleaseAttestation({attestation,trustedKeys:f.trustedKeys,expected:changedReport,now:new Date("2026-10-09T08:01:00.000Z")}).blockers).toContain("ATTESTATION_REPORT_DIGEST_MISMATCH");
 });
 it("rejects unknown signing keys, invalid signatures, and expired attestations",()=>{
  const f=fixture();const attestation={algorithm:"Ed25519",keyId:"unknown-key",payload:f.payload,signatureBase64:f.signatureBase64};
  expect(verifyReleaseAttestation({attestation,trustedKeys:f.trustedKeys,expected:f.expected,now:new Date("2026-10-09T08:01:00.000Z")}).blockers).toContain("ATTESTATION_SIGNING_KEY_UNTRUSTED");
  const trusted={...attestation,keyId:"ci-key-1",signatureBase64:Buffer.from("bad signature").toString("base64")};
  expect(verifyReleaseAttestation({attestation:trusted,trustedKeys:f.trustedKeys,expected:f.expected,now:new Date("2026-10-09T08:01:00.000Z")}).verified).toBe(false);
  const old={...f.payload,issuedAt:"2026-10-01T08:00:00.000Z"};
  const oldAtt={algorithm:"Ed25519",keyId:"ci-key-1",payload:old,signatureBase64:sign(null,Buffer.from(canonicalJson(old)),(generateKeyPairSync("ed25519")).privateKey).toString("base64")};
  expect(verifyReleaseAttestation({attestation:oldAtt,trustedKeys:f.trustedKeys,expected:f.expected,now:new Date("2026-10-09T08:01:00.000Z")}).blockers).toContain("ATTESTATION_EXPIRED");
 });
 it("requires a valid signature as part of release eligibility",()=>{\n  const f=fixture();const payload=buildAttestationPayload({...f.expected,issuedAt});const signatureBase64=sign(null,Buffer.from(canonicalJson(payload)),generateKeyPairSync("ed25519").privateKey).toString("base64");\n  const blocked=evaluateSignedReleaseGate({evidence:{...f.expected,reviewerActor:"human-reviewer",approvalReference:"approval-58"},attestation:{algorithm:"Ed25519",keyId:"ci-key-1",payload,signatureBase64},trustedKeys:f.trustedKeys,now:new Date("2026-10-09T08:01:00.000Z")});expect(blocked.eligible).toBe(false);expect(blocked.blockers).toContain("ATTESTATION_SIGNATURE_INVALID");\n  const validPair=generateKeyPairSync("ed25519");const validSignature=sign(null,Buffer.from(canonicalJson(payload)),validPair.privateKey).toString("base64");\n  const valid=evaluateSignedReleaseGate({evidence:{...f.expected,reviewerActor:"human-reviewer",approvalReference:"approval-58"},attestation:{algorithm:"Ed25519",keyId:"ci-key-1",payload,signatureBase64:validSignature},trustedKeys:new Map([["ci-key-1",validPair.publicKey]]),now:new Date("2026-10-09T08:01:00.000Z")});expect(valid.eligible).toBe(true);\n });\n it("rejects malformed attestations and future-dated payloads",()=>{
  const f=fixture();expect(verifyReleaseAttestation({attestation:{},trustedKeys:f.trustedKeys,expected:f.expected}).blockers).toContain("ATTESTATION_INVALID_SHAPE");
  const future={...f.payload,issuedAt:"2026-10-10T08:00:00.000Z"};
  const att={algorithm:"Ed25519",keyId:"ci-key-1",payload:future,signatureBase64:sign(null,Buffer.from(canonicalJson(future)),generateKeyPairSync("ed25519").privateKey).toString("base64")};
  expect(verifyReleaseAttestation({attestation:att,trustedKeys:f.trustedKeys,expected:f.expected,now:new Date("2026-10-09T08:01:00.000Z")}).blockers).toContain("ATTESTATION_ISSUED_IN_FUTURE");
 });
});
