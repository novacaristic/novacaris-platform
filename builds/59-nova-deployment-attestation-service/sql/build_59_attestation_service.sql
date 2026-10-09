-- Build 59 requires Build 57 and Build 58 migrations first.
ALTER TABLE nova_deployment_attestation_audit
  DROP CONSTRAINT IF EXISTS nova_deployment_attestation_audit_action_check;
ALTER TABLE nova_deployment_attestation_audit
  ADD CONSTRAINT nova_deployment_attestation_audit_action_check
  CHECK (action IN ('attestation_verified','attestation_rejected','signer_key_revoked','release_approval_authorized'));
CREATE INDEX IF NOT EXISTS nova_deployment_signed_attestations_tenant_ledger_idx
  ON nova_deployment_signed_attestations (tenant_id, ledger_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS nova_deployment_attestation_audit_tenant_attestation_idx
  ON nova_deployment_attestation_audit (tenant_id, attestation_id, created_at DESC);
