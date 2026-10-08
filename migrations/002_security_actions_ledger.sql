CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source_finding_id TEXT NOT NULL, title TEXT NOT NULL,
  owner_role TEXT CHECK (owner_role IN ('OWNER','ADMIN','COMPLIANCE','OPERATIONS','CLINICAL','FINANCE','VIEWER')),
  due_at TIMESTAMPTZ, status TEXT NOT NULL CHECK (status IN ('OPEN','IN_REVIEW','BLOCKED','COMPLETED','VERIFICATION_REQUIRED')),
  requires_human_authorization BOOLEAN NOT NULL DEFAULT FALSE, evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS actions_org_status_idx ON actions (organization_id, status);
CREATE TABLE IF NOT EXISTS authorization_requests (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  agent_id TEXT NOT NULL, action TEXT NOT NULL, subject_id TEXT NOT NULL, evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  decided_at TIMESTAMPTZ, approver_id TEXT, rationale TEXT
);
CREATE INDEX IF NOT EXISTS authorization_org_status_idx ON authorization_requests (organization_id, status);
CREATE TABLE IF NOT EXISTS evidence_ledger_entries (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL, actor_id TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL, subject_id TEXT NOT NULL,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb, metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ledger_org_timestamp_idx ON evidence_ledger_entries (organization_id, timestamp DESC);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION novacaris_current_organization()
RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.organization_id', true), ''); $$;

DROP POLICY IF EXISTS organizations_scope ON organizations;
CREATE POLICY organizations_scope ON organizations USING (id = novacaris_current_organization()) WITH CHECK (id = novacaris_current_organization());
DROP POLICY IF EXISTS members_scope ON organization_members;
CREATE POLICY members_scope ON organization_members USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS workspaces_scope ON workspaces;
CREATE POLICY workspaces_scope ON workspaces USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS intake_scope ON provider_intakes;
CREATE POLICY intake_scope ON provider_intakes USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS assessments_scope ON assessments;
CREATE POLICY assessments_scope ON assessments USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS findings_scope ON assessment_findings;
CREATE POLICY findings_scope ON assessment_findings USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS evidence_scope ON evidence_records;
CREATE POLICY evidence_scope ON evidence_records USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS actions_scope ON actions;
CREATE POLICY actions_scope ON actions USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS authorization_scope ON authorization_requests;
CREATE POLICY authorization_scope ON authorization_requests USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
DROP POLICY IF EXISTS ledger_scope ON evidence_ledger_entries;
CREATE POLICY ledger_scope ON evidence_ledger_entries USING (organization_id = novacaris_current_organization()) WITH CHECK (organization_id = novacaris_current_organization());
