-- Build 50: tenant-scoped reconciliation case management and append-only audit evidence.
CREATE TABLE IF NOT EXISTS nova_pilot_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL REFERENCES nova_pilot_operations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  event_id text NOT NULL,
  downstream_reference text NOT NULL,
  reason_code text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_actor text,
  resolution text CHECK (resolution IN ('downstream_completed', 'downstream_not_executed', 'manual_follow_up')),
  resolution_evidence_reference text,
  resolution_note text,
  UNIQUE (tenant_id, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_nova_reconciliation_open
  ON nova_pilot_reconciliation_cases(tenant_id, opened_at)
  WHERE state = 'open';

CREATE TABLE IF NOT EXISTS nova_pilot_reconciliation_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES nova_pilot_reconciliation_cases(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('case_opened', 'case_resolved')),
  actor_reference text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nova_reconciliation_audit_case
  ON nova_pilot_reconciliation_audit(tenant_id, case_id, id);

CREATE OR REPLACE FUNCTION nova_pilot_reconciliation_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RECONCILIATION_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS trg_nova_pilot_reconciliation_audit_immutable ON nova_pilot_reconciliation_audit;
CREATE TRIGGER trg_nova_pilot_reconciliation_audit_immutable
  BEFORE UPDATE OR DELETE ON nova_pilot_reconciliation_audit
  FOR EACH ROW EXECUTE FUNCTION nova_pilot_reconciliation_audit_immutable();

-- No automatic retry is implied by a reconciliation decision. A separate,
-- explicitly authorized execution workflow must consume any resolved decision.
