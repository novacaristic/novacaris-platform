CREATE SCHEMA IF NOT EXISTS nova_security;
CREATE TABLE IF NOT EXISTS nova_security.authorization_audit (
  event_id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  correlation_id text NOT NULL,
  tenant_id text NOT NULL,
  actor_sub text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow','deny')),
  reason_code text NOT NULL
);
CREATE INDEX IF NOT EXISTS authorization_audit_tenant_time_idx ON nova_security.authorization_audit (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_actor_time_idx ON nova_security.authorization_audit (actor_sub, occurred_at DESC);
CREATE OR REPLACE FUNCTION nova_security.reject_authorization_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AUTHORIZATION_AUDIT_APPEND_ONLY'; END;
$$;
DROP TRIGGER IF EXISTS authorization_audit_append_only ON nova_security.authorization_audit;
CREATE TRIGGER authorization_audit_append_only BEFORE UPDATE OR DELETE ON nova_security.authorization_audit FOR EACH ROW EXECUTE FUNCTION nova_security.reject_authorization_audit_mutation();
-- Runtime role must not own the schema/table; grant INSERT/SELECT only, never UPDATE/DELETE/TRUNCATE/DDL.