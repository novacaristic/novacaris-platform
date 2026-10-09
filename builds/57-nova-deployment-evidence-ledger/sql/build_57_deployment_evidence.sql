CREATE TABLE IF NOT EXISTS nova_deployment_evidence_ledger (
  id BIGSERIAL PRIMARY KEY,
  environment TEXT NOT NULL CHECK (length(environment) BETWEEN 2 AND 64),
  commit_sha TEXT NOT NULL CHECK (commit_sha ~ '^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$'),
  smoke_run_id TEXT NOT NULL CHECK (length(smoke_run_id) BETWEEN 8 AND 80),
  smoke_result TEXT NOT NULL CHECK (smoke_result IN ('passed','failed')),
  eligible BOOLEAN NOT NULL,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers) = 'array'),
  smoke_report JSONB NOT NULL CHECK (jsonb_typeof(smoke_report) = 'object'),
  test_run_url TEXT NOT NULL,
  reviewer_actor TEXT NOT NULL CHECK (length(reviewer_actor) BETWEEN 1 AND 200),
  approval_reference TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (environment, commit_sha, smoke_run_id)
);
CREATE TABLE IF NOT EXISTS nova_deployment_evidence_audit (
  id BIGSERIAL PRIMARY KEY,
  ledger_id BIGINT NOT NULL REFERENCES nova_deployment_evidence_ledger(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('release_evidence_recorded','release_approval_recorded')),
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION nova_reject_deployment_evidence_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DEPLOYMENT_EVIDENCE_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS nova_deployment_evidence_audit_immutable ON nova_deployment_evidence_audit;
CREATE TRIGGER nova_deployment_evidence_audit_immutable
BEFORE UPDATE OR DELETE ON nova_deployment_evidence_audit
FOR EACH ROW EXECUTE FUNCTION nova_reject_deployment_evidence_audit_mutation();
