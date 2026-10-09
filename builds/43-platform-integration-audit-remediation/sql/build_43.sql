CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_audit_build_inventory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 build_key text NOT NULL UNIQUE,
 build_name text NOT NULL,
 repository_path text NOT NULL,
 source_revision text,
 artifact_status text NOT NULL DEFAULT 'unknown',
 implementation_status text NOT NULL DEFAULT 'unknown',
 test_status text NOT NULL DEFAULT 'not_run',
 integration_status text NOT NULL DEFAULT 'not_run',
 deployment_status text NOT NULL DEFAULT 'not_deployed',
 evidence_reference text,
 reviewer_id uuid,
 reviewed_at timestamptz,
 notes_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_audit_dependencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_build_key text NOT NULL REFERENCES nova_audit_build_inventory(build_key),
 target_build_key text NOT NULL REFERENCES nova_audit_build_inventory(build_key),
 dependency_type text NOT NULL,
 contract_reference text,
 required boolean NOT NULL DEFAULT true,
 verification_status text NOT NULL DEFAULT 'unknown',
 evidence_reference text,
 UNIQUE(source_build_key,target_build_key,dependency_type)
);

CREATE TABLE IF NOT EXISTS nova_audit_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_key text NOT NULL UNIQUE,
 build_key text REFERENCES nova_audit_build_inventory(build_key),
 evidence_type text NOT NULL,
 source_revision text NOT NULL,
 environment text NOT NULL,
 result text NOT NULL,
 artifact_reference text NOT NULL,
 collected_at timestamptz NOT NULL,
 collected_by uuid,
 limitations jsonb NOT NULL DEFAULT '[]',
 metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_audit_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 finding_key text NOT NULL UNIQUE,
 build_key text REFERENCES nova_audit_build_inventory(build_key),
 category text NOT NULL,
 severity text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 evidence_reference text,
 impact text NOT NULL,
 remediation_reference text,
 owner_role text,
 status text NOT NULL DEFAULT 'open',
 due_at timestamptz,
 disposition_rationale text,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_audit_remediation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 finding_id uuid NOT NULL REFERENCES nova_audit_findings(id),
 event_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 evidence_reference text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_audit_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_key text NOT NULL UNIQUE,
 source_revision text NOT NULL,
 scope jsonb NOT NULL DEFAULT '{}',
 summary jsonb NOT NULL DEFAULT '{}',
 blocking_findings jsonb NOT NULL DEFAULT '[]',
 evidence_references jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft',
 prepared_by uuid,
 approved_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_status_severity ON nova_audit_findings(status,severity,created_at);
CREATE INDEX IF NOT EXISTS idx_audit_evidence_build ON nova_audit_evidence(build_key,collected_at);
CREATE INDEX IF NOT EXISTS idx_audit_inventory_status ON nova_audit_build_inventory(test_status,integration_status,deployment_status);
