-- NCI persistence schema (DRAFT, not yet run against a database).
-- Every table carries tenant_id and is protected by row-level security keyed to app.tenant_id.
-- The application must SET LOCAL app.tenant_id = '<tenant>' inside each transaction, using a role that is NOT the table owner.
CREATE TABLE nci_snapshot (
  tenant_id text PRIMARY KEY,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE nci_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE nci_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY nci_snapshot_tenant ON nci_snapshot
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Append-only audit copy, one row per event. No UPDATE or DELETE is granted to the application role.
CREATE TABLE nci_audit (
  tenant_id text NOT NULL,
  seq integer NOT NULL,
  at timestamptz NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  subject text NOT NULL,
  detail text NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (tenant_id, seq)
);
ALTER TABLE nci_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE nci_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY nci_audit_select ON nci_audit FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY nci_audit_insert ON nci_audit FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
