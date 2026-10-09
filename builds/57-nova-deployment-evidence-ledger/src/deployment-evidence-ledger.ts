import type { Pool } from "pg";
import { evaluateReleaseGate, type ReleaseEvidenceInput, type ReleaseGateResult } from "./release-gate";

export interface EvidenceActor { type: "user" | "agent"; reference: string }
export interface EvidenceContext { tenantId: string; actor: EvidenceActor; authorizationDecisionReference?: string }
export interface RecordEvidenceInput extends ReleaseEvidenceInput { requestId: string }
export interface EvidenceRecordResult extends ReleaseGateResult { ledgerId?: string; recordedAt?: string; replayed?: boolean }
type Authorizer = (context: EvidenceContext, action: "deployment.evidence.record" | "deployment.release.approve") => Promise<boolean>;
export class DeploymentEvidenceLedger {
  constructor(private readonly pool: Pool, private readonly authorize: Authorizer) {}
  private assertHuman(context: EvidenceContext): void {
    if (context.actor.type !== "user" || !context.actor.reference.trim()) throw new Error("DEPLOYMENT_EVIDENCE_HUMAN_ACTOR_REQUIRED");
    if (!context.authorizationDecisionReference?.trim()) throw new Error("DEPLOYMENT_EVIDENCE_AUTHORIZATION_REFERENCE_REQUIRED");
  }
  async record(context: EvidenceContext, input: RecordEvidenceInput): Promise<EvidenceRecordResult> {
    this.assertHuman(context);
    if (!await this.authorize(context, "deployment.evidence.record")) throw new Error("DEPLOYMENT_EVIDENCE_RECORD_FORBIDDEN");
    const gate = evaluateReleaseGate(input);
    const validatedReport = gate.report ?? (input.smokeReport && typeof input.smokeReport === "object" ? input.smokeReport : { invalid: true });
    const runId = (validatedReport as { runId?: unknown }).runId;
    if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(runId)) throw new Error("DEPLOYMENT_EVIDENCE_RUN_ID_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query(
        "SELECT id, eligible, blockers, recorded_at FROM nova_deployment_evidence_ledger WHERE tenant_id=$1::uuid AND environment=$2 AND commit_sha=$3 AND smoke_run_id=$4 FOR UPDATE",
        [context.tenantId, input.environment, input.commitSha, runId],
      );
      if (prior.rows[0]) {
        await client.query("COMMIT");
        return { ...gate, ledgerId: String(prior.rows[0].id), recordedAt: new Date(prior.rows[0].recorded_at).toISOString(), replayed: true, eligible: Boolean(prior.rows[0].eligible), blockers: prior.rows[0].blockers };
      }
      const inserted = await client.query(
        `INSERT INTO nova_deployment_evidence_ledger
          (tenant_id, environment, commit_sha, smoke_run_id, smoke_result, eligible, blockers, smoke_report, test_run_url, reviewer_actor, approval_reference)
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11) RETURNING id, recorded_at`,
        [context.tenantId, input.environment, input.commitSha, runId, (validatedReport as { result?: string }).result === "passed" ? "passed" : "failed", gate.eligible, JSON.stringify(gate.blockers), JSON.stringify(validatedReport), input.testRunUrl, input.reviewerActor, input.approvalReference ?? null],
      );
      const row = inserted.rows[0];
      await client.query(
        "INSERT INTO nova_deployment_evidence_audit (ledger_id, action, actor, details) VALUES ($1,'release_evidence_recorded',$2,$3::jsonb)",
        [row.id, context.actor.reference, JSON.stringify({ environment: input.environment, commitSha: input.commitSha, eligible: gate.eligible, blockerCount: gate.blockers.length, requestId: input.requestId })],
      );
      await client.query("COMMIT");
      return { ...gate, ledgerId: String(row.id), recordedAt: new Date(row.recorded_at).toISOString(), replayed: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async approve(context: EvidenceContext, ledgerId: string, approvalReference: string): Promise<{ ledgerId: string; approved: true; replayed: boolean }> {
    this.assertHuman(context);
    if (!await this.authorize(context, "deployment.release.approve")) throw new Error("DEPLOYMENT_RELEASE_APPROVAL_FORBIDDEN");
    if (!/^\d+$/.test(ledgerId) || !approvalReference.trim()) throw new Error("DEPLOYMENT_RELEASE_APPROVAL_INPUT_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT id, eligible, approval_reference FROM nova_deployment_evidence_ledger WHERE id=$1 AND tenant_id=$2::uuid FOR UPDATE", [ledgerId, context.tenantId]);
      const row = found.rows[0];
      if (!row) throw new Error("DEPLOYMENT_EVIDENCE_NOT_FOUND");
      if (!row.eligible) throw new Error("DEPLOYMENT_RELEASE_GATE_BLOCKED");
      const audit = await client.query("SELECT id FROM nova_deployment_evidence_audit WHERE ledger_id=$1 AND action='release_approval_recorded' AND details->>'approvalReference'=$2 LIMIT 1", [ledgerId, approvalReference]);
      if (audit.rows[0]) { await client.query("COMMIT"); return { ledgerId, approved: true, replayed: true }; }
      if (row.approval_reference && row.approval_reference !== approvalReference) throw new Error("DEPLOYMENT_RELEASE_ALREADY_APPROVED_DIFFERENT_REFERENCE");
      await client.query("UPDATE nova_deployment_evidence_ledger SET approval_reference=$2 WHERE id=$1", [ledgerId, approvalReference]);
      await client.query("INSERT INTO nova_deployment_evidence_audit (ledger_id, action, actor, details) VALUES ($1,'release_approval_recorded',$2,$3::jsonb)", [ledgerId, context.actor.reference, JSON.stringify({ approvalReference, authorizationDecisionReference: context.authorizationDecisionReference })]);
      await client.query("COMMIT");
      return { ledgerId, approved: true, replayed: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
