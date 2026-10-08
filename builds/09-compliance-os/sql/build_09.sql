CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 requirement_code text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 authority text NOT NULL,
 jurisdiction text,
 service_type text,
 source_uri text,
 source_version text,
 effective_from timestamptz,
 effective_to timestamptz,
 priority text NOT NULL DEFAULT 'medium',
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id, requirement_code, source_version)
);

CREATE TABLE IF NOT EXISTS nova_evidence_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 evidence_type text NOT NULL,
 title text NOT NULL,
 source_system text,
 source_uri text,
 source_id text,
 content_hash text,
 owner_user_id uuid,
 captured_at timestamptz,
 expires_at timestamptz,
 verification_status text NOT NULL DEFAULT 'unverified',
 notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_requirement_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 requirement_id uuid NOT NULL REFERENCES nova_requirements(id),
 evidence_id uuid NOT NULL REFERENCES nova_evidence_items(id),
 relationship text NOT NULL,
 confidence numeric(5,4),
 assessed_by text NOT NULL DEFAULT 'mr_nova',
 assessed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(requirement_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS nova_compliance_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 requirement_id uuid NOT NULL REFERENCES nova_requirements(id),
 result text NOT NULL,
 rationale text NOT NULL,
 evidence_ids uuid[] NOT NULL DEFAULT '{}',
 assessed_by text NOT NULL DEFAULT 'mr_nova',
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_corrective_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 finding_id uuid NOT NULL REFERENCES nova_compliance_findings(id),
 title text NOT NULL,
 action_plan text NOT NULL,
 owner_user_id uuid,
 priority text NOT NULL DEFAULT 'medium',
 due_at timestamptz,
 status text NOT NULL DEFAULT 'open',
 verification_criteria text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_readiness_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 assessment_type text NOT NULL,
 scope text NOT NULL,
 score numeric(5,2),
 status text NOT NULL,
 critical_gaps integer NOT NULL DEFAULT 0,
 open_actions integer NOT NULL DEFAULT 0,
 evidence_coverage numeric(5,2),
 rationale text NOT NULL,
 generated_at timestamptz NOT NULL DEFAULT now()
);
