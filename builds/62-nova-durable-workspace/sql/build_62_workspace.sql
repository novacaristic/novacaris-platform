-- Build 62: durable, tenant-scoped client/case workspace.
CREATE TABLE IF NOT EXISTS nova_workspace_cases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS nova_workspace_notes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  author_reference text NOT NULL,
  source text NOT NULL CHECK (source IN ('human','ai_assisted')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  status text NOT NULL CHECK (status IN ('draft','submitted_for_review','changes_requested','approved')),
  version integer NOT NULL CHECK (version > 0),
  compliance_blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(compliance_blockers) = 'array'),
  reviewer_reference text,
  review_note text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (tenant_id, case_id) REFERENCES nova_workspace_cases(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_nova_workspace_notes_case
  ON nova_workspace_notes (tenant_id, case_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS nova_workspace_audit (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  note_id uuid NOT NULL,
  actor_reference text NOT NULL,
  action text NOT NULL CHECK (action IN ('draft_created','compliance_checked','submitted_for_review','changes_requested','approved')),
  occurred_at timestamptz NOT NULL,
  authorization_decision_reference text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (tenant_id, note_id) REFERENCES nova_workspace_notes(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_nova_workspace_audit_note
  ON nova_workspace_audit (tenant_id, note_id, occurred_at, event_id);

CREATE OR REPLACE FUNCTION nova_workspace_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'WORKSPACE_AUDIT_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS trg_nova_workspace_audit_immutable ON nova_workspace_audit;
CREATE TRIGGER trg_nova_workspace_audit_immutable
  BEFORE UPDATE OR DELETE ON nova_workspace_audit
  FOR EACH ROW EXECUTE FUNCTION nova_workspace_audit_immutable();

-- A tenant may only see its own rows through the store's tenant predicates.
-- This migration is not a substitute for separate database roles or production RLS.
