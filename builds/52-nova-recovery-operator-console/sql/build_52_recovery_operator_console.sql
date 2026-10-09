-- Build 52: tenant-scoped operator queue review for recovery executions.
CREATE TABLE IF NOT EXISTS nova_pilot_recovery_operator_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES nova_pilot_recovery_executions(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('downstream_completed', 'downstream_not_executed', 'manual_follow_up')),
  evidence_reference text NOT NULL,
  review_note text NOT NULL,
  reviewed_by_actor text NOT NULL,
  authorization_reference text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, execution_id)
);
CREATE INDEX IF NOT EXISTS idx_nova_recovery_operator_reviews_tenant
  ON nova_pilot_recovery_operator_reviews(tenant_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS nova_pilot_recovery_operator_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  review_id uuid NOT NULL REFERENCES nova_pilot_recovery_operator_reviews(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action = 'ambiguous_execution_reviewed'),
  actor_reference text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nova_recovery_operator_audit
  ON nova_pilot_recovery_operator_audit(tenant_id, review_id, id);

CREATE OR REPLACE FUNCTION nova_pilot_recovery_operator_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RECOVERY_OPERATOR_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS trg_nova_pilot_recovery_operator_audit_immutable ON nova_pilot_recovery_operator_audit;
CREATE TRIGGER trg_nova_pilot_recovery_operator_audit_immutable
  BEFORE UPDATE OR DELETE ON nova_pilot_recovery_operator_audit
  FOR EACH ROW EXECUTE FUNCTION nova_pilot_recovery_operator_audit_immutable();
