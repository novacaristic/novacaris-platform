CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_deployment_environments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 environment_key text NOT NULL UNIQUE,
 environment_type text NOT NULL,
 status text NOT NULL DEFAULT 'planned',
 configuration_reference text NOT NULL,
 secret_bundle_reference text,
 region_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_release_manifests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_key text NOT NULL UNIQUE,
 source_revision text NOT NULL,
 artifact_reference text NOT NULL,
 artifact_digest text NOT NULL,
 manifest_reference text NOT NULL,
 build_status text NOT NULL DEFAULT 'pending',
 test_summary jsonb NOT NULL DEFAULT '{}',
 dependency_lock_reference text,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_deployment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_manifest_id uuid NOT NULL REFERENCES nova_release_manifests(id),
 environment_id uuid NOT NULL REFERENCES nova_deployment_environments(id),
 status text NOT NULL DEFAULT 'requested',
 requested_by uuid NOT NULL,
 change_summary text NOT NULL,
 risk_assessment_reference text,
 migration_plan_reference text,
 rollback_plan_reference text NOT NULL,
 approved_by uuid,
 approved_at timestamptz,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_deployment_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_request_id uuid NOT NULL REFERENCES nova_deployment_requests(id),
 check_key text NOT NULL,
 check_type text NOT NULL,
 required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'pending',
 evidence_reference text,
 details jsonb NOT NULL DEFAULT '{}',
 executed_at timestamptz,
 UNIQUE(deployment_request_id,check_key)
);

CREATE TABLE IF NOT EXISTS nova_deployment_migration_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_request_id uuid NOT NULL REFERENCES nova_deployment_requests(id),
 migration_key text NOT NULL,
 migration_checksum text NOT NULL,
 execution_status text NOT NULL DEFAULT 'pending',
 started_at timestamptz,
 completed_at timestamptz,
 output_reference text,
 recovery_action_reference text,
 verified_by uuid,
 verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_deployment_health_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_request_id uuid NOT NULL REFERENCES nova_deployment_requests(id),
 check_key text NOT NULL,
 status text NOT NULL,
 endpoint_reference text,
 evidence_reference text,
 observed_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_deployment_recoveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_request_id uuid NOT NULL REFERENCES nova_deployment_requests(id),
 recovery_type text NOT NULL,
 reason text NOT NULL,
 target_release_reference text,
 status text NOT NULL DEFAULT 'requested',
 approved_by uuid,
 started_at timestamptz,
 completed_at timestamptz,
 verification_reference text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_deployment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_request_id uuid REFERENCES nova_deployment_requests(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployment_requests_status
ON nova_deployment_requests(environment_id,status,created_at);

CREATE INDEX IF NOT EXISTS idx_deployment_checks_status
ON nova_deployment_checks(deployment_request_id,status);

CREATE INDEX IF NOT EXISTS idx_deployment_events_request
ON nova_deployment_events(deployment_request_id,created_at);
