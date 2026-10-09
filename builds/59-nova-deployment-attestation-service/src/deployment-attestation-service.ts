import type { Pool } from "pg";
import type { EvidenceContext, DeploymentEvidenceLedger } from "../../../builds/57-nova-deployment-evidence-ledger/src/deployment-evidence-ledger";
import type { SmokeReport } from "../../../builds/57-nova-deployment-evidence-ledger/src/release-gate";
import { verifyReleaseAttestation, type SignedReleaseAttestation } from "../../../builds/58-nova-signed-release-attestation/src/provenance-attestation";

type Action = "deployment.attestation.submit" | "deployment.release.approve";
type Authorizer = (context: EvidenceContext, action: Action) => Promise<boolean>;
export interface SubmitAttestationInput { ledgerId: string; requestId: string; attestation: unknown }
export interface AttestationSubmissionResult {
  ledgerId: string;
  attestationId?: string;
  verified: boolean;
  blockers: string[];
  replayed: boolean;
  payloadSha256?: string;
}
export class DeploymentAttestationService {
  constructor(
    private readonly pool: Pool,
    private readonly ledger: DeploymentEvidenceLedger,
    private readonly authorize: Authorizer,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private assertHuman(context: EvidenceContext): void {
    if (context.actor.type !== "user" || !context.actor.reference.trim()) throw new Error("DEPLOYMENT_ATTESTATION_HUMAN_ACTOR_REQUIRED");
    if (!context.authorizationDecisionReference?.trim()) throw new Error("DEPLOYMENT_ATTESTATION_AUTHORIZATION_REFERENCE_REQUIRED");
  }
  async submit(context: EvidenceContext, input: SubmitAttestationInput): Promise<AttestationSubmissionResult> {
    this.assertHuman(context);
    if (!await this.authorize(context, "deployment.attestation.submit")) throw new Error("DEPLOYMENT_ATTESTATION_SUBMIT_FORBIDDEN");
    if (!/^\d+$/.test(input.ledgerId) || !input.requestId.trim()) throw new Error("DEPLOYMENT_ATTESTATION_INPUT_INVALID");
    const attestation = input.attestation as Partial<SignedReleaseAttestation> | null;
    if (!attestation || typeof attestation !== "object" || typeof attestation.keyId !== "string") {
      return { ledgerId: input.ledgerId, verified: false, blockers: ["ATTESTATION_INVALID_SHAPE"], replayed: false };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT id, environment, commit_sha, smoke_run_id, smoke_report, test_run_url, eligible
         FROM nova_deployment_evidence_ledger WHERE id=$1 AND tenant_id=$2::uuid FOR UPDATE`,
        [input.ledgerId, context.tenantId],
      );
      const row = found.rows[0];
      if (!row) throw new Error("DEPLOYMENT_EVIDENCE_NOT_FOUND");
      if (!row.eligible) throw new Error("DEPLOYMENT_RELEASE_GATE_BLOCKED");
      const keyResult = await client.query(
        `SELECT public_key_pem FROM nova_deployment_attestation_keys
         WHERE key_id=$1 AND algorithm='Ed25519' AND status='active' AND valid_from <= $2
         AND (valid_until IS NULL OR valid_until > $2)`,
        [attestation.keyId, this.now()],
      );
      const keyRow = keyResult.rows[0];
      const report = row.smoke_report as SmokeReport;
      const verification = verifyReleaseAttestation({
        attestation: input.attestation,
        trustedKeys: new Map(keyRow ? [[attestation.keyId, String(keyRow.public_key_pem)]] : []),
        expected: { environment: String(row.environment), commitSha: String(row.commit_sha), smokeReport: report, testRunUrl: String(row.test_run_url) },
        now: this.now(),
      });
      if (!verification.verified) {
        await client.query("ROLLBACK");
        return { ledgerId: input.ledgerId, verified: false, blockers: verification.blockers, replayed: false };
      }
      const payload = attestation.payload!;
      const prior = await client.query(
        "SELECT id, payload_sha256 FROM nova_deployment_signed_attestations WHERE tenant_id=$1::uuid AND ledger_id=$2 AND payload_sha256=$3 FOR UPDATE",
        [context.tenantId, input.ledgerId, verification.payloadSha256],
      );
      if (prior.rows[0]) {
        await client.query("COMMIT");
        return { ledgerId: input.ledgerId, attestationId: String(prior.rows[0].id), verified: true, blockers: [], replayed: true, payloadSha256: verification.payloadSha256 };
      }
      const inserted = await client.query(
        `INSERT INTO nova_deployment_signed_attestations
         (tenant_id, ledger_id, key_id, payload_sha256, payload, signature_base64, verified, verification_blockers)
         VALUES ($1::uuid,$2,$3,$4,$5::jsonb,$6,true,'[]'::jsonb) RETURNING id`,
        [context.tenantId, input.ledgerId, attestation.keyId, verification.payloadSha256, JSON.stringify(payload), attestation.signatureBase64],
      );
      const id = String(inserted.rows[0].id);
      await client.query(
        "INSERT INTO nova_deployment_attestation_audit (tenant_id,attestation_id,action,actor,details) VALUES ($1::uuid,$2,'attestation_verified',$3,$4::jsonb)",
        [context.tenantId, id, context.actor.reference, JSON.stringify({ requestId: input.requestId, ledgerId: input.ledgerId, keyId: attestation.keyId, payloadSha256: verification.payloadSha256 })],
      );
      await client.query("COMMIT");
      return { ledgerId: input.ledgerId, attestationId: id, verified: true, blockers: [], replayed: false, payloadSha256: verification.payloadSha256 };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
  async approve(context: EvidenceContext, ledgerId: string, approvalReference: string): Promise<{ ledgerId: string; approved: true; replayed: boolean }> {
    this.assertHuman(context);
    if (!await this.authorize(context, "deployment.release.approve")) throw new Error("DEPLOYMENT_RELEASE_APPROVAL_FORBIDDEN");
    if (!/^\\d+$/.test(ledgerId) || !approvalReference.trim()) throw new Error("DEPLOYMENT_RELEASE_APPROVAL_INPUT_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT e.id, e.environment, e.commit_sha, e.smoke_run_id, e.smoke_report, e.test_run_url, e.eligible,
                a.id AS attestation_id, a.key_id, a.payload_sha256, a.payload, a.signature_base64, a.verified
         FROM nova_deployment_evidence_ledger e
         JOIN nova_deployment_signed_attestations a ON a.ledger_id=e.id AND a.tenant_id=e.tenant_id
         WHERE e.id=$1 AND e.tenant_id=$2::uuid AND a.verified=true
         ORDER BY a.recorded_at DESC LIMIT 1 FOR UPDATE OF e,a`,
        [ledgerId, context.tenantId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("DEPLOYMENT_SIGNED_ATTESTATION_REQUIRED");
      if (!row.eligible) throw new Error("DEPLOYMENT_RELEASE_GATE_BLOCKED");
      const keyResult = await client.query(
        `SELECT public_key_pem FROM nova_deployment_attestation_keys
         WHERE key_id=$1 AND algorithm='Ed25519' AND status='active' AND valid_from <= $2
         AND (valid_until IS NULL OR valid_until > $2)`,
        [row.key_id, this.now()],
      );
      if (!keyResult.rows[0]) throw new Error("DEPLOYMENT_ATTESTATION_SIGNING_KEY_INACTIVE");
      const verification = verifyReleaseAttestation({
        attestation: { algorithm: "Ed25519", keyId: row.key_id, payload: row.payload, signatureBase64: row.signature_base64 },
        trustedKeys: new Map([[String(row.key_id), String(keyResult.rows[0].public_key_pem)]]),
        expected: { environment: String(row.environment), commitSha: String(row.commit_sha), smokeReport: row.smoke_report as SmokeReport, testRunUrl: String(row.test_run_url) },
        now: this.now(),
      });
      if (!verification.verified || verification.payloadSha256 !== row.payload_sha256) throw new Error("DEPLOYMENT_ATTESTATION_REVERIFICATION_FAILED");
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
    // Keep the existing human authorization and append-only approval audit in the canonical Build 57 ledger.
    return this.ledger.approve(context, ledgerId, approvalReference);
  }
}
