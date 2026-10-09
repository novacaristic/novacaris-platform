CREATE TABLE IF NOT EXISTS nova_deployment_attestation_keys (
  key_id TEXT PRIMARY KEY CHECK (length(key_id) BETWEEN 1 AND 128),
  public_key_pem TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm = 'Ed25519'),
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE TABLE IF NOT EXISTS nova_deployment_signed_attestations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ledger_id BIGINT NOT NULL REFERENCES nova_deployment_evidence_ledger(id) ON DELETE RESTRICT,
  key_id TEXT NOT NULL REFERENCES nova_deployment_attestation_keys(key_id) ON DELETE RESTRICT,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  signature_base64 TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  verification_blockers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(verification_blockers) = 'array'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ledger_id, payload_sha256)
);
CREATE TABLE IF NOT EXISTS nova_deployment_attestation_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  attestation_id BIGINT NOT NULL REFERENCES nova_deployment_signed_attestations(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('attestation_verified','attestation_rejected','signer_key_revoked')),
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION nova_reject_deployment_attestation_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DEPLOYMENT_ATTESTATION_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS nova_deployment_attestation_audit_immutable ON nova_deployment_attestation_audit;
CREATE TRIGGER nova_deployment_attestation_audit_immutable
BEFORE UPDATE OR DELETE ON nova_deployment_attestation_audit
FOR EACH ROW EXECUTE FUNCTION nova_reject_deployment_attestation_audit_mutation();
