-- Build 51: separately authorized, idempotent recovery execution.
CREATE TABLE IF NOT EXISTS nova_pilot_recovery_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES nova_pilot_reconciliation_cases(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  requested_by_actor text NOT NULL,
  authorization_reference text NOT NULL,
  status text NOT NULL CHECK (status IN ('executing', 'completed', 'reconciliation_required')),
  downstream_reference text,
  evidence_reference text,
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, case_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_nova_recovery_executions_tenant_status
  ON nova_pilot_recovery_executions(tenant_id, status, started_at);

CREATE TABLE IF NOT EXISTS nova_pilot_recovery_execution_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES nova_pilot_recovery_executions(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('recovery_reserved', 'recovery_completed', 'recovery_outcome_ambiguous')),
  actor_reference text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nova_recovery_execution_audit
  ON nova_pilot_recovery_execution_audit(tenant_id, execution_id, id);

CREATE OR REPLACE FUNCTION nova_pilot_recovery_execution_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RECOVERY_EXECUTION_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS trg_nova_pilot_recovery_execution_audit_immutable ON nova_pilot_recovery_execution_audit;
CREATE TRIGGER trg_nova_pilot_recovery_execution_audit_immutable
  BEFORE UPDATE OR DELETE ON nova_pilot_recovery_execution_audit
  FOR EACH ROW EXECUTE FUNCTION nova_pilot_recovery_execution_audit_immutable();
