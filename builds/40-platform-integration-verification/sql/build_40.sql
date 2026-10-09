CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_platform_builds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 build_key text NOT NULL UNIQUE,
 name text NOT NULL,
 repository_path text NOT NULL,
 status text NOT NULL DEFAULT 'planned',
 version text,
 owner_role text,
 manifest_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_platform_dependencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_build_id uuid NOT NULL REFERENCES nova_platform_builds(id),
 target_build_id uuid NOT NULL REFERENCES nova_platform_builds(id),
 dependency_type text NOT NULL,
 contract_reference text,
 required boolean NOT NULL DEFAULT true,
 compatibility_status text NOT NULL DEFAULT 'unknown',
 reviewed_at timestamptz,
 UNIQUE(source_build_id,target_build_id,dependency_type)
);

CREATE TABLE IF NOT EXISTS nova_platform_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_key text NOT NULL,
 version text NOT NULL,
 contract_type text NOT NULL,
 owner_build_id uuid REFERENCES nova_platform_builds(id),
 schema_reference text NOT NULL,
 compatibility_policy jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft',
 approved_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contract_key,version)
);

CREATE TABLE IF NOT EXISTS nova_platform_migrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 migration_key text NOT NULL UNIQUE,
 build_id uuid NOT NULL REFERENCES nova_platform_builds(id),
 sequence_number integer NOT NULL,
 migration_reference text NOT NULL,
 checksum text NOT NULL,
 depends_on jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'planned',
 applied_environment text,
 applied_at timestamptz,
 verified_by uuid,
 verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_verification_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_key text NOT NULL,
 version text NOT NULL,
 scope jsonb NOT NULL DEFAULT '{}',
 required_checks jsonb NOT NULL DEFAULT '[]',
 acceptance_criteria jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft',
 approved_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(plan_key,version)
);

CREATE TABLE IF NOT EXISTS nova_verification_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES nova_verification_plans(id),
 environment text NOT NULL,
 source_revision text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 started_at timestamptz,
 completed_at timestamptz,
 runner_reference text,
 summary jsonb NOT NULL DEFAULT '{}',
 evidence_references jsonb NOT NULL DEFAULT '[]',
 warnings jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_verification_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES nova_verification_runs(id),
 check_key text NOT NULL,
 check_type text NOT NULL,
 status text NOT NULL,
 severity text NOT NULL DEFAULT 'info',
 expected_reference text,
 actual_reference text,
 evidence_reference text,
 details jsonb NOT NULL DEFAULT '{}',
 executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_verification_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES nova_verification_runs(id),
 finding_key text NOT NULL,
 severity text NOT NULL,
 title text NOT NULL,
 description_reference text NOT NULL,
 affected_builds jsonb NOT NULL DEFAULT '[]',
 remediation_reference text,
 status text NOT NULL DEFAULT 'open',
 disposition_rationale text,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,finding_key)
);

CREATE TABLE IF NOT EXISTS nova_release_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_key text NOT NULL,
 source_revision text NOT NULL,
 environment text NOT NULL,
 decision text NOT NULL DEFAULT 'pending',
 verification_run_id uuid REFERENCES nova_verification_runs(id),
 blockers jsonb NOT NULL DEFAULT '[]',
 conditions jsonb NOT NULL DEFAULT '[]',
 decided_by uuid,
 rationale text,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_platform_verification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_type text NOT NULL,
 subject_type text NOT NULL,
 subject_reference text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_runs_status
ON nova_verification_runs(environment,status,created_at);

CREATE INDEX IF NOT EXISTS idx_verification_findings_status
ON nova_verification_findings(status,severity,created_at);

CREATE INDEX IF NOT EXISTS idx_release_decisions
ON nova_release_decisions(environment,decision,created_at);
