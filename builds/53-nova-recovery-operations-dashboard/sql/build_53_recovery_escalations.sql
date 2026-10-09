-- Build 53: durable operator escalation and append-only audit.
CREATE TABLE IF NOT EXISTS nova_pilot_recovery_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES nova_pilot_recovery_executions(id) ON DELETE RESTRICT,
  priority text NOT NULL CHECK (priority IN ('normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  reason text NOT NULL,
  assigned_to_actor text,
  created_by_actor text NOT NULL,
  authorization_reference text NOT NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by_actor text,
  resolved_at timestamptz,
  resolved_by_actor text,
  resolution_evidence_reference text,
  resolution_note text,
  UNIQUE (tenant_id, execution_id)
);
CREATE INDEX IF NOT EXISTS idx_nova_recovery_escalations_queue
  ON nova_pilot_recovery_escalations(tenant_id, status, priority, created_at);

CREATE TABLE IF NOT EXISTS nova_pilot_recovery_escalation_audit (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  escalation_id uuid NOT NULL REFERENCES nova_pilot_recovery_escalations(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('escalation_opened', 'escalation_acknowledged', 'escalation_resolved', 'escalation_reassigned')),
  actor_reference text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nova_recovery_escalation_audit
  ON nova_pilot_recovery_escalation_audit(tenant_id, escalation_id, id);

CREATE OR REPLACE FUNCTION nova_pilot_recovery_escalation_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RECOVERY_ESCALATION_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS trg_nova_pilot_recovery_escalation_audit_immutable ON nova_pilot_recovery_escalation_audit;
CREATE TRIGGER trg_nova_pilot_recovery_escalation_audit_immutable
  BEFORE UPDATE OR DELETE ON nova_pilot_recovery_escalation_audit
  FOR EACH ROW EXECUTE FUNCTION nova_pilot_recovery_escalation_audit_immutable();
