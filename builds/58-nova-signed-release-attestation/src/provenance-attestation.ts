import { createHash, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { evaluateReleaseGate, type ReleaseEvidenceInput, type ReleaseGateResult, type SmokeReport } from "../../../builds/57-nova-deployment-evidence-ledger/src/release-gate";

export interface ReleaseAttestationPayload {
  schemaVersion: "1.0";
  environment: string;
  commitSha: string;
  smokeRunId: string;
  smokeReportSha256: string;
  testRunUrl: string;
  issuedAt: string;
}
export interface SignedReleaseAttestation {
  algorithm: "Ed25519";
  keyId: string;
  payload: ReleaseAttestationPayload;
  signatureBase64: string;
}
export interface AttestationVerification {
  verified: boolean;
  blockers: string[];
  keyId?: string;
  payloadSha256?: string;
}
export type TrustedAttestationKeys = ReadonlyMap<string, string | Buffer | KeyObject>;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
}
export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
export function buildAttestationPayload(input: {
  environment: string; commitSha: string; smokeReport: SmokeReport; testRunUrl: string; issuedAt: string;
}): ReleaseAttestationPayload {
  return {
    schemaVersion: "1.0",
    environment: input.environment,
    commitSha: input.commitSha,
    smokeRunId: input.smokeReport.runId,
    smokeReportSha256: sha256Hex(canonicalJson(input.smokeReport)),
    testRunUrl: input.testRunUrl,
    issuedAt: input.issuedAt,
  };
}
export function verifyReleaseAttestation(input: {
  attestation: unknown;
  trustedKeys: TrustedAttestationKeys;
  expected: { environment: string; commitSha: string; smokeReport: SmokeReport; testRunUrl: string };
  now?: Date;
  maxAgeSeconds?: number;
}): AttestationVerification {
  const blockers: string[] = [];
  const att = input.attestation as Partial<SignedReleaseAttestation> | null;
  if (!att || typeof att !== "object" || att.algorithm !== "Ed25519" || typeof att.keyId !== "string" ||
      !att.payload || typeof att.payload !== "object" || typeof att.signatureBase64 !== "string") {
    return { verified: false, blockers: ["ATTESTATION_INVALID_SHAPE"] };
  }
  const key = input.trustedKeys.get(att.keyId);
  if (!key) blockers.push("ATTESTATION_SIGNING_KEY_UNTRUSTED");
  const p = att.payload;
  if (p.schemaVersion !== "1.0") blockers.push("ATTESTATION_SCHEMA_UNSUPPORTED");
  if (p.environment !== input.expected.environment) blockers.push("ATTESTATION_ENVIRONMENT_MISMATCH");
  if (p.commitSha !== input.expected.commitSha) blockers.push("ATTESTATION_COMMIT_MISMATCH");
  if (p.smokeRunId !== input.expected.smokeReport.runId) blockers.push("ATTESTATION_SMOKE_RUN_MISMATCH");
  if (p.smokeReportSha256 !== sha256Hex(canonicalJson(input.expected.smokeReport))) blockers.push("ATTESTATION_REPORT_DIGEST_MISMATCH");
  if (p.testRunUrl !== input.expected.testRunUrl) blockers.push("ATTESTATION_TEST_RUN_MISMATCH");
  if (typeof p.issuedAt !== "string" || Number.isNaN(Date.parse(p.issuedAt)) || new Date(p.issuedAt).toISOString() !== p.issuedAt) {
    blockers.push("ATTESTATION_ISSUED_AT_INVALID");
  } else {
    const now = (input.now ?? new Date()).getTime();
    const age = now - Date.parse(p.issuedAt);
    const maxAge = (input.maxAgeSeconds ?? 86400) * 1000;
    if (age < -300000) blockers.push("ATTESTATION_ISSUED_IN_FUTURE");
    if (age > maxAge) blockers.push("ATTESTATION_EXPIRED");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(att.signatureBase64) || att.signatureBase64.length > 4096) blockers.push("ATTESTATION_SIGNATURE_ENCODING_INVALID");
  if (key && !blockers.some(b => b.startsWith("ATTESTATION_") && b !== "ATTESTATION_SIGNATURE_ENCODING_INVALID")) {
    try {
      const signature = Buffer.from(att.signatureBase64, "base64");
      const valid = cryptoVerify(null, Buffer.from(canonicalJson(p)), key, signature);
      if (!valid) blockers.push("ATTESTATION_SIGNATURE_INVALID");
    } catch { blockers.push("ATTESTATION_SIGNATURE_INVALID"); }
  }
  const unique = [...new Set(blockers)];
  if (unique.length) return { verified: false, blockers: unique, keyId: att.keyId };
  return { verified: true, blockers: [], keyId: att.keyId, payloadSha256: sha256Hex(canonicalJson(p)) };
}

export interface SignedReleaseGateResult extends ReleaseGateResult {
  attestationVerification: AttestationVerification;
}
/** Release gate that requires cryptographic provenance; never accepts a caller-supplied verified flag. */
export function evaluateSignedReleaseGate(input: {
  evidence: ReleaseEvidenceInput;
  attestation: unknown;
  trustedKeys: TrustedAttestationKeys;
  now?: Date;
  maxAgeSeconds?: number;
}): SignedReleaseGateResult {
  const gate = evaluateReleaseGate(input.evidence);
  const verification = verifyReleaseAttestation({
    attestation: input.attestation,
    trustedKeys: input.trustedKeys,
    expected: {
      environment: input.evidence.environment,
      commitSha: input.evidence.commitSha,
      smokeReport: gate.report ?? (input.evidence.smokeReport as SmokeReport),
      testRunUrl: input.evidence.testRunUrl,
    },
    now: input.now,
    maxAgeSeconds: input.maxAgeSeconds,
  });
  const blockers = [...new Set([...gate.blockers, ...verification.blockers])];
  return {
    ...gate,
    eligible: gate.eligible && verification.verified && blockers.length === 0,
    blockers,
    warnings: gate.warnings,
    attestationVerification: verification,
  };
}
